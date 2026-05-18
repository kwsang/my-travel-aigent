from typing import Any
import logging
import asyncio
import json
import re
import ast
from bson import ObjectId
from gemini_agent.clients import gmaps_client, places_client, destinations_collection

logger = logging.getLogger(__name__)

def calculate_travel_time(origin: Any, destination: Any) -> tuple[int, float, str]:
    """Helper to calculate travel duration, distance in miles, and mode (walking/driving)."""
    try:
        # Handle dict coordinates or raw address strings
        orig = f"{origin['latitude']},{origin['longitude']}" if isinstance(origin, dict) else origin
        dest = f"{destination['latitude']},{destination['longitude']}" if isinstance(destination, dict) else destination

        # 1. Driving check to get initial distance and traffic duration
        matrix = gmaps_client.distance_matrix(origins=[orig], destinations=[dest], mode="driving", departure_time="now")
        if matrix['status'] == 'OK':
            element = matrix['rows'][0]['elements'][0]
            if element['status'] == 'OK':
                distance_meters = element['distance']['value']
                distance_miles = distance_meters * 0.000621371
                
                # 2. Walking logic: if < 0.5 miles, fetch walking duration
                if distance_miles < 0.5:
                    walking_matrix = gmaps_client.distance_matrix(origins=[orig], destinations=[dest], mode="walking")
                    if walking_matrix['status'] == 'OK':
                        w_element = walking_matrix['rows'][0]['elements'][0]
                        if w_element['status'] == 'OK':
                            return w_element['duration']['value'] // 60, distance_miles, "walking"
                
                # 3. Default to driving results
                duration_mins = element['duration_in_traffic']['value'] // 60
                return duration_mins, distance_miles, "driving"
    except Exception as e:
        logger.error(f"Failed to calculate travel time from {origin} to {destination}: {e}")
    return 0, 0.0, "unknown"

def _parse_json_or_literal(raw_str: str, default_val: Any) -> Any:
    if not isinstance(raw_str, str):
        return raw_str
    s = raw_str.strip()
    if not s:
        return default_val
        
    # Clean up non-breaking spaces (LLM formatting hallucination)
    s = s.replace('\xa0', ' ')

    match = re.search(r'```(?:json)?\s*(.*?)\s*```', s, re.DOTALL | re.IGNORECASE)
    if match:
        s = match.group(1).strip()
        
    # Auto-fix truncated JSON arrays common in LLM outputs
    if s.startswith('[') and not s.endswith(']'):
        s += ']'
    elif s.startswith('{') and not s.endswith('}'):
        s += '}'

    # 1. Try JSON parsing. Replace invalid single-quote escapes first.
    try:
        s_json = s.replace("\\'", "'")
        return json.loads(s_json, strict=False)
    except json.JSONDecodeError:
        # 2. Fallback to Python literal evaluation
        try:
            s_py = re.sub(r'\btrue\b', 'True', s)
            s_py = re.sub(r'\bfalse\b', 'False', s_py)
            s_py = re.sub(r'\bnull\b', 'None', s_py)
            return ast.literal_eval(s_py)
        except Exception:
            raise ValueError(f"Could not parse string as JSON or Python literal. String was: {s[:100]}...")

def _extract_list_from_payload(payload: Any) -> list:
    if isinstance(payload, str):
        try: 
            payload = _parse_json_or_literal(payload, [])
        except Exception:
            pass
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    elif isinstance(payload, dict):
        for v in payload.values():
            if isinstance(v, list):
                return [item for item in v if isinstance(item, dict)]
        return [payload]
    return []

def get_state_context(tool_context: Any) -> tuple[dict, dict]:
    """Safely extracts the itinerary and profile dictionaries from the agent's tool context state."""
    if not tool_context:
        return {}, {}
        
    state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
    
    itinerary = state.get("final_itinerary") or {}
    if isinstance(itinerary, str):
        try: itinerary = json.loads(itinerary)
        except Exception: itinerary = {}
        
    profile = state.get("traveler_profile") or state.get("user_profile_data") or {}
    if isinstance(profile, str):
        try: profile = json.loads(profile)
        except Exception: profile = {}
        
    return itinerary, profile

def anchor_location(loc: str, destination: str, starting_location: str = None) -> str:
    """Appends the destination to a location string for geographic anchoring, preventing LLM hallucinations."""
    if not loc or not destination: return loc
    if not any(c.isalpha() for c in str(loc)): return loc # Skip raw coordinates
    if destination.lower() in str(loc).lower(): return loc # Skip already anchored strings
    if starting_location and starting_location.split(',')[0].strip().lower() in str(loc).lower(): return loc # Skip the starting location
    return f"{loc} in {destination}"

def parse_price_level(pl) -> int:
    """Helper to safely convert Google Places price levels to an integer from 1 to 4."""
    if isinstance(pl, int):
        return pl
    if isinstance(pl, str):
        pl_upper = pl.upper()
        if "FREE" in pl_upper or "INEXPENSIVE" in pl_upper or "1" in pl_upper:
            return 1
        if "VERY_EXPENSIVE" in pl_upper or "4" in pl_upper:
            return 4
        if "EXPENSIVE" in pl_upper or "3" in pl_upper:
            return 3
        return 2
    return 2

async def enrich_new_destination(dest_id: str | ObjectId):
    """
    Background task to fetch missing fields for a newly added destination.
    Designed to be fired asynchronously after a new destination is inserted.
    """
    if destinations_collection is None:
        return

    try:
        query_id = ObjectId(dest_id) if isinstance(dest_id, str) else dest_id
        dest = await destinations_collection.find_one({"_id": query_id})
        if not dest:
            logger.warning(f"Destination {dest_id} not found for enrichment.")
            return

        changed = False
        all_price_levels = []
        
        for field in ["suggested_lodging", "suggested_activities"]:
            items = dest.get(field, [])
            for item in items:
                name = item.get("name")
                if not name:
                    continue
                    
                pt = item.get("price_tier") or item.get("priceLevel")
                if pt is not None:
                    all_price_levels.append(parse_price_level(pt))

                if "rating" not in item or ("price_tier" not in item and "priceLevel" not in item):
                    try:
                        request = {"text_query": f"{name} in {dest.get('name', '')}", "max_result_count": 1}
                        mask = "places.rating,places.priceLevel,places.userRatingCount"
                        
                        response = await asyncio.to_thread(
                            places_client.search_text,
                            request=request, 
                            metadata=[("x-goog-fieldmask", mask)]
                        )
                        
                        if response.places:
                            place = response.places[0]
                            if getattr(place, "price_level", None):
                                item["price_tier"] = place.price_level.name if hasattr(place.price_level, "name") else place.price_level
                                all_price_levels.append(parse_price_level(item["price_tier"]))
                            if getattr(place, "rating", None):
                                item["rating"] = place.rating
                            if getattr(place, "user_rating_count", None):
                                item["user_rating_count"] = place.user_rating_count
                            changed = True
                    except Exception as e:
                        logger.warning(f"Failed to fetch data for {name}: {e}")

        if "price_rating" not in dest or changed:
            dest["price_rating"] = round(sum(all_price_levels) / len(all_price_levels)) if all_price_levels else 2
            await destinations_collection.update_one({"_id": dest["_id"]}, {"$set": dest})
            logger.info(f"Successfully enriched destination: {dest.get('name')}")
    except Exception as e:
        logger.error(f"Error enriching destination {dest_id}: {e}")
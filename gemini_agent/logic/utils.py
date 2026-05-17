from typing import Any
import logging
import asyncio
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
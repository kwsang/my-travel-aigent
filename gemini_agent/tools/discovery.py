import json
from gemini_agent.clients import voyage_client, destinations_collection, places_client, discovery_model
from gemini_agent.logic.models import Destination
import asyncio
import re
import ast
from typing import Optional, Any
from google.adk.agents.invocation_context import InvocationContext

def _get_active_destination(provided_name: str, tool_context: InvocationContext) -> str:
    if tool_context:
        state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
        itinerary = state.get("final_itinerary") or {}
        if isinstance(itinerary, str):
            try: itinerary = json.loads(itinerary)
            except: itinerary = {}
        if itinerary.get("destination"):
            return itinerary.get("destination")
    return provided_name

def _build_destination_query(dest_str: str) -> dict:
    parts = [p.strip() for p in dest_str.split(',')]
    query = {"name": {"$regex": f"^{parts[0]}", "$options": "i"}}
    if len(parts) > 1:
        query["state"] = {"$regex": f"^{parts[1][:2]}", "$options": "i"}
    if len(parts) > 2:
        query["country"] = {"$regex": f"^{parts[2][:2]}", "$options": "i"}
    return query

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

VALID_VIBES = [
    "historic", "coastal", "romantic", "city", "urban", "mountain", 
    "nature", "beach", "desert", "adventure", "culture", "food", 
    "tropical", "winter"
]

VALID_LODGING_TAGS = [
    "luxury", "budget", "boutique", "resort", "historic", "romantic", 
    "family", "business", "hostel", "bnb"
]

VALID_ACTIVITY_TAGS = [
    "outdoor", "indoor", "cultural", "food", "nightlife", "shopping", 
    "nature", "adventure", "relaxing", "family", "tour", "museum"
]

async def _generate_item_tags(item: dict, valid_tags: list, item_type: str):
    """Helper to auto-generate tags for a given item using the discovery model."""
    if not discovery_model:
        item["vibe_tags"] = []
        return
    name = item.get("name", "Unknown")
    desc = item.get("description", "")
    prompt = (
        f"Given the {item_type} '{name}' with description '{desc}', "
        f"choose 1 to 3 of the most appropriate tags from this exact list: {', '.join(valid_tags)}. "
        f"Return ONLY the tags as a comma-separated list, nothing else."
    )
    try:
        resp = await discovery_model.generate_content_async(prompt)
        suggested = [t.strip().lower() for t in resp.text.split(',')]
        item["vibe_tags"] = [t for t in suggested if t in valid_tags]
    except Exception:
        item["vibe_tags"] = []

async def search_destinations(query: str, tool_context: InvocationContext) -> str:
    """
    Performs a semantic search for travel destinations (strictly cities and towns).
    """
    enhanced_query = query
    if tool_context:
        state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
        profile = state.get("traveler_profile") or state.get("user_profile_data") or {}
        if isinstance(profile, str):
            try: profile = json.loads(profile)
            except: profile = {}
            
        interests = profile.get("interests", [])
        if interests:
            enhanced_query += f" matching interests: {', '.join(interests)}"

    try:
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        embed_resp = await asyncio.to_thread(voyage_client.embed, [enhanced_query], model="voyage-4", input_type="query")
        embedding = embed_resp.embeddings[0]
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "description_embedding",
                    "queryVector": embedding,
                    "numCandidates": 100,
                    "limit": 5
                }
            },
            {"$project": {"_id": 0, "description_embedding": 0}}
        ]
        results = await destinations_collection.aggregate(pipeline).to_list(length=5)
        if not results:
            return f"No destinations found matching '{query}'. Try a different vibe or invoke discover_new_destination."

        validated_destinations = [Destination.model_validate(res).model_dump() for res in results]
        return json.dumps(validated_destinations, default=str)
    except Exception as e:
        return f"Error during semantic search: {str(e)}"

async def discover_new_destination(vibe_or_city: str) -> str:
    """
    Autonomous Producer Tool: Discovers and seeds a new city destination into MongoDB.
    """
    try:
        if discovery_model is None:
            return "Error: Discovery model service is currently unavailable."
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."

        prompt = (
            f"Based on the input '{vibe_or_city}', identify the single most relevant major or popular "
            "destination. Return only the name in 'City, State, Country' format."
        )
        response = await discovery_model.generate_content_async(prompt)
        candidate = response.text.strip()

        if await destinations_collection.find_one(_build_destination_query(candidate)):
            return f"Destination '{candidate}' is already in the atlas."

        mask = "places.displayName,places.location,places.formattedAddress,places.types,places.addressComponents"
        request = {"text_query": candidate, "included_type": "locality", "max_result_count": 1}
        
        response = await asyncio.to_thread(
            places_client.search_text,
            request=request, 
            metadata=[("x-goog-fieldmask", mask)]
        )
        
        if not response.places:
            return f"Google Maps could not verify '{candidate}' as a valid locality."

        place = response.places[0]
        description = (f"The city of {place.display_name.text}. A destination discovered for its "
                      f"'{vibe_or_city}' characteristics, located in {place.formatted_address}.")
        
        state = ""
        country = ""
        for component in place.address_components:
            if "administrative_area_level_1" in component.types:
                state = component.short_text
            if "country" in component.types:
                country = component.short_text

        vibe_prompt = (
            f"Given the destination '{place.display_name.text}' with description '{description}', "
            f"choose 2 to 4 of the most appropriate vibe tags from this exact list: {', '.join(VALID_VIBES)}. "
            f"Return ONLY the tags as a comma-separated list, nothing else."
        )
        try:
            vibe_response = await discovery_model.generate_content_async(vibe_prompt)
            suggested_tags = [t.strip().lower() for t in vibe_response.text.split(',')]
            vibe_tags = [t for t in suggested_tags if t in VALID_VIBES]
        except Exception:
            vibe_tags = []
            
        if not vibe_tags:
            vibe_tags = vibe_or_city.lower().split()

        embed_resp = await asyncio.to_thread(voyage_client.embed, [description], model="voyage-4", input_type="document")
        embedding = embed_resp.embeddings[0]
        new_dest = {
            "name": place.display_name.text,
            "state": state,
            "country": country or "USA",
            "description": description,
            "description_embedding": embedding,
            "location": {"type": "Point", "coordinates": [place.location.longitude, place.location.latitude]},
            "vibe_tags": vibe_tags
        }
        await destinations_collection.insert_one(new_dest)
        return f"SUCCESS: Added '{place.display_name.text}' to the atlas."
    except Exception as e:
        return f"Discovery failed: {str(e)}"

async def save_destination_lodging(destination_name: str, lodging: str, tool_context: InvocationContext) -> str:
    """
    Saves a list of suggested lodging to a specific destination in the atlas.
    Useful for caching great hotel options for a city so users can browse them later.

    Args:
        destination_name: The name of the destination.
        lodging: A JSON string representing the list of lodging objects.
    """
    active_dest = _get_active_destination(destination_name, tool_context)
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        parsed_lodging = []
        if isinstance(lodging, str):
            try: parsed_lodging = _parse_json_or_literal(lodging, [])
            except Exception as e: return f"Error parsing 'lodging' JSON: {str(e)}"
        elif isinstance(lodging, list):
            parsed_lodging = lodging

        # Concurrently generate vibe tags for all incoming lodging
        tasks = [_generate_item_tags(acc, VALID_LODGING_TAGS, "lodging") for acc in parsed_lodging]
        await asyncio.gather(*tasks)
            
        dest = await destinations_collection.find_one(_build_destination_query(active_dest))
        if not dest:
            seed_result = await discover_new_destination(active_dest)
            if "SUCCESS" not in seed_result and "already in the atlas" not in seed_result:
                return f"Error: Destination '{active_dest}' not found and could not be seeded. Seed result: {seed_result}"
            dest = await destinations_collection.find_one(_build_destination_query(active_dest))
            if not dest:
                return f"Error: Destination '{active_dest}' not found in the atlas after seeding."
            
        existing = dest.get("suggested_lodging") or []
        existing_names = {item.get("name") for item in existing if "name" in item}
        to_add = [item for item in parsed_lodging if item.get("name") not in existing_names]
        
        if to_add:
            await destinations_collection.update_one(
                {"_id": dest["_id"]},
                {"$push": {"suggested_lodging": {"$each": to_add}}}
            )
            
        return f"SUCCESS: Lodgings saved to destination '{active_dest}'."
    except Exception as e:
        return f"Error saving lodging to destination: {str(e)}"

async def save_destination_activities(destination_name: str, activities: str, tool_context: InvocationContext) -> str:
    """
    Saves a list of suggested activities to a specific destination in the atlas.
    Useful for caching great experience and dining options for a city so users can browse them later.

    Args:
        destination_name: The name of the destination.
        activities: A JSON string representing the list of activity objects.
    """
    active_dest = _get_active_destination(destination_name, tool_context)
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        parsed_activities = []
        if isinstance(activities, str):
            try: parsed_activities = _parse_json_or_literal(activities, [])
            except Exception as e: return f"Error parsing 'activities' JSON: {str(e)}"
        elif isinstance(activities, list):
            parsed_activities = activities

        # Concurrently generate vibe tags for all incoming activities
        tasks = [_generate_item_tags(act, VALID_ACTIVITY_TAGS, "activity") for act in parsed_activities]
        await asyncio.gather(*tasks)
            
        dest = await destinations_collection.find_one(_build_destination_query(active_dest))
        if not dest:
            seed_result = await discover_new_destination(active_dest)
            if "SUCCESS" not in seed_result and "already in the atlas" not in seed_result:
                return f"Error: Destination '{active_dest}' not found and could not be seeded. Seed result: {seed_result}"
            dest = await destinations_collection.find_one(_build_destination_query(active_dest))
            if not dest:
                return f"Error: Destination '{active_dest}' not found in the atlas after seeding."
            
        existing = dest.get("suggested_activities") or []
        existing_names = {item.get("name") for item in existing if "name" in item}
        to_add = [item for item in parsed_activities if item.get("name") not in existing_names]
        
        if to_add:
            await destinations_collection.update_one(
                {"_id": dest["_id"]},
                {"$push": {"suggested_activities": {"$each": to_add}}}
            )
            
        return f"SUCCESS: Activities saved to destination '{active_dest}'."
    except Exception as e:
        return f"Error saving activities to destination: {str(e)}"

async def get_cached_lodging(destination_name: str, tool_context: InvocationContext) -> str:
    """
    Retrieves a list of highly recommended, pre-cached lodging for a specific destination from the database.
    Always use this before falling back to search_places.
    """
    active_dest = _get_active_destination(destination_name, tool_context)
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        dest = await destinations_collection.find_one(_build_destination_query(active_dest))
        
        if dest and dest.get("suggested_lodging"):
            accs = dest["suggested_lodging"]
            if tool_context:
                state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
                if "_venue_cache" not in state:
                    state["_venue_cache"] = {}
                for acc in accs:
                    state["_venue_cache"][acc.get("name", "")] = acc
            return json.dumps(accs, default=str)
            
        return "No cached lodging found. Please use the search_places tool instead."
    except Exception as e:
        return f"Error fetching cached lodging: {str(e)}"

async def get_cached_activities(destination_name: str, tool_context: InvocationContext) -> str:
    """
    Retrieves a list of highly recommended, pre-cached activities and dining options for a specific destination from the database.
    Always use this before falling back to search_places.
    """
    active_dest = _get_active_destination(destination_name, tool_context)
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        dest = await destinations_collection.find_one(_build_destination_query(active_dest))
        
        if dest and dest.get("suggested_activities"):
            acts = dest["suggested_activities"]
            if tool_context:
                state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
                if "_venue_cache" not in state:
                    state["_venue_cache"] = {}
                for act in acts:
                    state["_venue_cache"][act.get("name", "")] = act
            return json.dumps(acts, default=str)
            
        return "No cached activities found. Please use the search_places tool instead."
    except Exception as e:
        return f"Error fetching cached activities: {str(e)}"
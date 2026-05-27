import json
import logging
from gemini_agent.clients import voyage_client, destinations_collection, places_client, discovery_client
from gemini_agent.logic.models import Destination
import asyncio
import re
import ast
from typing import Optional, Any
from google.adk.agents.invocation_context import InvocationContext
from gemini_agent.logic.utils import _parse_json_or_literal, _extract_list_from_payload, get_state_context
from api.utils import safe_parse_json

logger = logging.getLogger(__name__)

_IN_FLIGHT_DISCOVERY = {}

def _get_active_destination(provided_name: str, tool_context: InvocationContext) -> str:
    itinerary, _ = get_state_context(tool_context)
    if itinerary.get("destination"):
        return itinerary.get("destination")
    return provided_name

def _build_destination_query(dest_str: str) -> dict:
    clean_str = dest_str.replace("`", "").replace("*", "").strip()
    parts = [p.strip() for p in clean_str.split(',')]
    safe_name = re.escape(parts[0])
    query = {"name": {"$regex": f"^{safe_name}", "$options": "i"}}
    # State abbreviations (e.g., 'VA' vs 'Virginia') frequently cause MongoDB cache misses.
    # Relying exclusively on the city name prevents the UI poller from erroneously triggering duplicate seeds.
    return query

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

async def _get_embedding_with_retry(text: str, input_type: str, max_retries: int = 4) -> list[float]:
    """Fetches Voyage AI embeddings with an async exponential backoff to handle rate limits without blocking threads."""
    for attempt in range(max_retries):
        try:
            embed_resp = await asyncio.to_thread(
                voyage_client.embed, [text], model="voyage-4", input_type=input_type
            )
            return embed_resp.embeddings[0]
        except Exception as e:
            is_rate_limit = "429" in str(e) or "rate limit" in str(e).lower() or "too many" in str(e).lower()
            if is_rate_limit and attempt < max_retries - 1:
                sleep_time = 2 ** attempt
                logger.warning(f"Voyage AI rate limit hit. Retrying in {sleep_time}s... (Attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(sleep_time)
            else:
                raise e

async def _generate_item_tags(item: dict, valid_tags: list, item_type: str):
    """Helper to auto-generate tags for a given item using the discovery model."""
    if not discovery_client:
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
        resp = await discovery_client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        item["vibe_tags"] = [t for t in valid_tags if t in resp.text.lower()]
    except Exception:
        item["vibe_tags"] = []

async def search_destinations(query: str, tool_context: InvocationContext) -> str:
    """
    Performs a semantic search for travel destinations (strictly cities and towns).
    """
    enhanced_query = query
    _, profile = get_state_context(tool_context)
    interests = profile.get("interests", [])
    if interests:
        enhanced_query += f" matching interests: {', '.join(interests)}"

    try:
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        embedding = await _get_embedding_with_retry(enhanced_query, "query")
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

async def _discover_new_destination_impl(vibe_or_city: str) -> str:
    try:
        if discovery_client is None:
            return "Error: Discovery model service is currently unavailable."
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."

        prompt = (
            f"Based on the input '{vibe_or_city}', identify the target city. "
            "If the input is already a specific city, return that exact city. "
            "If the input is a vague vibe or region, identify the single most relevant major or popular destination. "
            "Return only the name in 'City, State, Country' format."
        )
        response = await discovery_client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        candidate = response.text.replace("`", "").replace("*", "").strip()
        logger.info(f"Auto-seeding destination: '{vibe_or_city}'. LLM suggested: '{candidate}'")

        if await destinations_collection.find_one(_build_destination_query(candidate)):
            return f"Destination '{candidate}' is already in the atlas."

        mask = "places.displayName,places.location,places.formattedAddress,places.types,places.addressComponents,places.editorialSummary"
        request = {"text_query": candidate, "max_result_count": 1}
        
        response = await asyncio.to_thread(
            places_client.search_text,
            request=request, 
            metadata=[("x-goog-fieldmask", mask)]
        )
        
        if not response.places:
            return f"Google Maps could not verify '{candidate}' as a valid destination."

        place = response.places[0]
        summary = place.editorial_summary.text if place.editorial_summary else ""
        base_description = (f"The city of {place.display_name.text}. A destination located in {place.formatted_address}. {summary}")
        
        state = ""
        country = ""
        for component in place.address_components:
            if "administrative_area_level_1" in component.types:
                state = component.short_text
            if "country" in component.types:
                country = component.short_text

        try:
            vibe_prompt = (
                f"Given the destination '{place.display_name.text}' with this background: '{base_description}', "
                f"write a rich, engaging 2-3 sentence travel description highlighting its culture, scenery, and overall vibe. "
                f"Also, choose 2 to 4 of the most appropriate vibe tags from this exact list: {', '.join(VALID_VIBES)}. "
                f"Return the result strictly as a JSON object with two keys: 'description' (string) and 'tags' (list of strings)."
            )
            vibe_response = await discovery_client.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents=vibe_prompt
            )
            
            parsed_resp = safe_parse_json(vibe_response.text, default={})
            description = parsed_resp.get("description", base_description)
            
            raw_tags = parsed_resp.get("tags", [])
            if isinstance(raw_tags, str):
                raw_tags = raw_tags.split(",")
            vibe_tags = [t for t in VALID_VIBES if any(t.lower() in str(rt).lower() for rt in raw_tags)]
            
        except Exception as e:
            logger.warning(f"Failed to generate rich description/tags: {e}")
            description = base_description
            vibe_tags = []
            
        if not vibe_tags:
            vibe_tags = vibe_or_city.lower().split()

        embedding = await _get_embedding_with_retry(description, "document")
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

async def discover_new_destination(vibe_or_city: str) -> str:
    """
    Autonomous Producer Tool: Discovers and seeds a new city destination into MongoDB.
    """
    key = vibe_or_city.lower().strip()
    if key in _IN_FLIGHT_DISCOVERY:
        logger.info(f"Auto-seeding for '{vibe_or_city}' is already in progress. Waiting for it to finish to prevent duplicates...")
        try:
            return await asyncio.wait_for(_IN_FLIGHT_DISCOVERY[key], timeout=60.0)
        except asyncio.TimeoutError:
            return "Discovery failed: Request timed out waiting for in-flight operation."
        except Exception as e:
            return f"Discovery failed: {str(e)}"

    loop = asyncio.get_running_loop()
    future = loop.create_future()
    _IN_FLIGHT_DISCOVERY[key] = future

    try:
        result = await asyncio.wait_for(_discover_new_destination_impl(vibe_or_city), timeout=60.0)
        future.set_result(result)
        return result
    except asyncio.TimeoutError:
        err = TimeoutError("Destination discovery process timed out.")
        future.set_exception(err)
        return f"Discovery failed: {str(err)}"
    except Exception as e:
        future.set_exception(e)
        return f"Discovery failed: {str(e)}"
    finally:
        _IN_FLIGHT_DISCOVERY.pop(key, None)

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
            
        parsed_lodging = _extract_list_from_payload(lodging)
        if not parsed_lodging:
            logger.warning(f"save_destination_lodging received empty or unparseable lodging data: {lodging}")
            return "Error: No valid lodging data provided to save. Ensure you pass a JSON list."

        # Hydrate missing fields (like 'geo' coordinates) from the in-memory venue cache
        if tool_context:
            state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
            venue_cache = state.get("_venue_cache", {})
            for acc in parsed_lodging:
                name = acc.get("name")
                if name:
                    cached = venue_cache.get(name)
                    if not cached: # Fallback to fuzzy case-insensitive match
                        for c_name, c_data in venue_cache.items():
                            if name.lower() in c_name.lower() or c_name.lower() in name.lower():
                                cached = c_data
                                break
                    if cached:
                        for k, v in cached.items():
                            if k not in acc:
                                acc[k] = v

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
                {"$push": {
                    "suggested_lodging": {
                        "$each": to_add,
                        "$slice": -50
                    }
                }}
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
            
        parsed_activities = _extract_list_from_payload(activities)
        if not parsed_activities:
            logger.warning(f"save_destination_activities received empty or unparseable activities data: {activities}")
            return "Error: No valid activities data provided to save. Ensure you pass a JSON list."

        # Hydrate missing fields (like 'geo' coordinates) from the in-memory venue cache
        if tool_context:
            state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
            venue_cache = state.get("_venue_cache", {})
            for act in parsed_activities:
                name = act.get("name")
                if name:
                    cached = venue_cache.get(name)
                    if not cached: # Fallback to fuzzy case-insensitive match
                        for c_name, c_data in venue_cache.items():
                            if name.lower() in c_name.lower() or c_name.lower() in name.lower():
                                cached = c_data
                                break
                    if cached:
                        for k, v in cached.items():
                            if k not in act:
                                act[k] = v

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
                {"$push": {
                    "suggested_activities": {
                        "$each": to_add,
                        "$slice": -50
                    }
                }}
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
        
        if not dest:
            logger.info(f"Destination '{active_dest}' not found for lodging. Attempting to auto-seed...")
            seed_result = await discover_new_destination(active_dest)
            if "SUCCESS" not in seed_result and "already in the atlas" not in seed_result:
                return f"Error: Destination '{active_dest}' not found and could not be seeded. Seed result: {seed_result}"
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
        
        if not dest:
            logger.info(f"Destination '{active_dest}' not found for activities. Attempting to auto-seed...")
            seed_result = await discover_new_destination(active_dest)
            if "SUCCESS" not in seed_result and "already in the atlas" not in seed_result:
                return f"Error: Destination '{active_dest}' not found and could not be seeded. Seed result: {seed_result}"
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
    
async def vector_search_places(destination_name: str, query: str, tool_context: InvocationContext) -> str:
    """
    Performs a Hybrid Search (Semantic + Keyword) for places within a specific destination.
    Combines Voyage AI embeddings ($vectorSearch) with BM25 ($search) via Reciprocal Rank Fusion (RRF).
    """
    active_dest = _get_active_destination(destination_name, tool_context)
    try:
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."

        db = destinations_collection.database

        # 1. Fetch the semantic embedding for the user's query
        embedding = await _get_embedding_with_retry(query, "query")
        
        # 2. Pipeline 1: Semantic Vector Search
        vector_pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index", 
                    "path": "embedding",
                    "queryVector": embedding,
                    "numCandidates": 50,
                    "limit": 10
                }
            },
            { "$project": { "_id": 0, "embedding": 0 } }
        ]
        
        # 3. Execute Vector Search
        # Note: Hybrid Text search removed to stay within MongoDB Free Tier 3-index limit
        top_places = await db["places"].aggregate(vector_pipeline).to_list(length=5)
        
        if not top_places:
            return f"No semantic matches found for '{query}' in {active_dest}."
            
        return json.dumps(top_places, default=str)
    except Exception as e:
        return f"Error during hybrid search for places: {str(e)}"
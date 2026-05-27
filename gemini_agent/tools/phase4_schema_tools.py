import json
import logging
from .phase1_state_tools import get_db

logger = logging.getLogger(__name__)

async def query_raw_place_data(place_id: str, field_path: str) -> str:
    """
    Queries nested, raw Google Places data using MongoDB dot notation.
    Use this to find specific deep details (like accessibility options, exact review text, etc.) 
    that aren't in the summarized venue payload.
    
    Args:
        place_id: The Google Place ID of the venue.
        field_path: The dot-notation path to the desired data (e.g., 'accessibilityOptions', 'reviews', 'paymentOptions').
    """
    db = get_db()
    
    # 1. Search places_cache (Phase 2 Geospatial cache)
    doc = await db.places_cache.find_one(
        {"place_id": place_id},
        {"_id": 0, f"raw_google_data.{field_path}": 1}
    )
    
    if doc and "raw_google_data" in doc:
        # MongoDB projection automatically filters the dict structure to match the path
        return json.dumps(doc["raw_google_data"])
        
    # 2. Fallback to scratchpad (Phase 1)
    pipeline = [
        {"$unwind": "$items"},
        {"$match": {"items.place_id": place_id}},
        {"$project": {"_id": 0, "result": f"$items.raw_google_data.{field_path}"}}
    ]
    
    try:
        results = await db.planning_scratchpad.aggregate(pipeline).to_list(length=1)
        if results and results[0].get("result") is not None:
            return json.dumps({field_path: results[0]["result"]})
    except Exception as e:
        logger.error(f"Error querying scratchpad for raw data: {e}")
        
    return f"Could not find data for path '{field_path}' on place '{place_id}'."
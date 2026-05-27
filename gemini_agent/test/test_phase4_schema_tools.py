import asyncio
import logging
import sys
import os
import json

# Ensure the project root is in the python path to allow absolute imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from gemini_agent.tools.phase4_schema_tools import query_raw_place_data
from gemini_agent.tools.phase1_state_tools import get_db

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

async def test_schema_less_queries():
    db = get_db()
    test_place_id_1 = "ChIJ_test_cache_123"
    test_place_id_2 = "ChIJ_test_scratchpad_456"
    session_id = "test_session_schema_123"

    logger.info("Setting up database with deeply nested mock payloads...")
    
    # 1. Setup Data in places_cache (Simulating Phase 2 Geospatial Caching)
    cache_doc = {
        "place_id": test_place_id_1,
        "name": "Test Cache Restaurant",
        "raw_google_data": {
            "accessibilityOptions": {
                "wheelchairAccessibleParking": True,
                "wheelchairAccessibleEntrance": False
            }
        }
    }
    await db.places_cache.insert_one(cache_doc)

    # 2. Setup Data in planning_scratchpad (Simulating Phase 1 Massive JIT Fetching)
    scratchpad_doc = {
        "session_id": session_id,
        "data_type": "restaurants",
        "items": [
            {
                "place_id": test_place_id_2,
                "name": "Test Scratchpad Restaurant",
                "raw_google_data": {
                    "paymentOptions": {"acceptsCreditCards": True}
                }
            }
        ]
    }
    await db.planning_scratchpad.insert_one(scratchpad_doc)

    try:
        logger.info("\n--- Test 1: Querying places_cache ---")
        result1 = await query_raw_place_data(test_place_id_1, "accessibilityOptions.wheelchairAccessibleParking")
        logger.info(f"Extracted: {result1}")
        assert "true" in result1.lower() or "True" in result1, "Failed to fetch nested cache data"

        logger.info("\n--- Test 2: Querying planning_scratchpad (Array Aggregation) ---")
        result2 = await query_raw_place_data(test_place_id_2, "paymentOptions.acceptsCreditCards")
        logger.info(f"Extracted: {result2}")
        assert "true" in result2.lower() or "True" in result2, "Failed to fetch nested scratchpad data"

        logger.info("\n✅ All schema-less dot-notation queries passed!")

    finally:
        logger.info("\nCleaning up test database records...")
        await db.places_cache.delete_one({"place_id": test_place_id_1})
        await db.planning_scratchpad.delete_one({"session_id": session_id})

if __name__ == "__main__":
    asyncio.run(test_schema_less_queries())
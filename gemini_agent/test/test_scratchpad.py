import asyncio
import logging
import sys
import os

# Ensure the project root is in the python path to allow absolute imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from gemini_agent.tools.phase1_state_tools import (
    save_to_scratchpad,
    get_top_items_from_scratchpad,
    get_db
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

async def test_scratchpad():
    session_id = "test_massive_places_session_123"
    data_type = "restaurants"
    
    logger.info(f"Generating massive payload for session '{session_id}'...")
    
    # Simulate a massive payload from Google Places API (50 restaurants with nested data)
    massive_places_payload = []
    for i in range(50):
        massive_places_payload.append({
            "place_id": f"ChIJ_fake_id_{i}",
            "name": f"Test Restaurant {i}",
            "rating": 4.0 + (i % 10) / 10.0,
            "user_ratings_total": 100 + i * 5,
            "price_level": (i % 4) + 1,
            "formatted_address": f"{i} Main St, City, Country",
            "geometry": {
                "location": {"lat": 34.0522 + (i * 0.001), "lng": -118.2437 + (i * 0.001)}
            },
            "types": ["restaurant", "food", "point_of_interest", "establishment"],
            "raw_google_data": {
                "accessibilityOptions": {"wheelchairAccessibleParking": True},
                "reviews": [{"author_name": "Bob", "rating": 5, "text": "Great!"}] * 5  # Simulate heavy nested array
            }
        })
        
    payload_size_kb = len(str(massive_places_payload)) / 1024
    logger.info(f"Generated {len(massive_places_payload)} items. Approximate context size: {payload_size_kb:.2f} KB")

    # 1. Test Saving to Scratchpad
    logger.info("Saving to MongoDB scratchpad...")
    save_result = await save_to_scratchpad(session_id, data_type, massive_places_payload)
    logger.info(f"Save Result: {save_result}")
    
    # 2. Test Retrieving from Scratchpad (Limiting to top 3 to simulate saving LLM context)
    logger.info("Retrieving top 3 items from scratchpad to simulate Agent query...")
    retrieved_items = await get_top_items_from_scratchpad(session_id, data_type, limit=3)
    
    logger.info(f"Successfully retrieved {len(retrieved_items)} items!")
    for idx, item in enumerate(retrieved_items):
        logger.info(f"  Item {idx+1}: {item['name']} (Rating: {item['rating']})")

    # 3. Clean up database
    logger.info("Cleaning up test data from MongoDB...")
    db = get_db()
    await db.planning_scratchpad.delete_many({"session_id": session_id})
    logger.info("Test complete!")

if __name__ == "__main__":
    asyncio.run(test_scratchpad())
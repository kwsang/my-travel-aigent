import asyncio
import logging
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

from gemini_agent.clients import destinations_collection, places_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("backfill")

async def backfill_states():
    if destinations_collection is None or places_client is None:
        logger.error("Database or Places API client is not initialized. Check your credentials.")
        return

    # Find destinations where 'state' is missing, empty, or is longer than 2 characters (full name)
    query = {"$or": [{"state": {"$exists": False}}, {"state": ""}, {"state": {"$regex": "^.{3,}$"}}]}
    cursor = destinations_collection.find(query)
    docs = await cursor.to_list(length=None)

    logger.info(f"Found {len(docs)} destinations requiring state backfill.")

    mask = "places.addressComponents"

    for doc in docs:
        name = doc.get("name")
        logger.info(f"Fetching state for '{name}'...")

        request = {"text_query": name, "included_type": "locality", "max_result_count": 1}

        try:
            response = await asyncio.to_thread(
                places_client.search_text, request=request, metadata=[("x-goog-fieldmask", mask)]
            )

            if response.places:
                state = next((c.short_text for c in response.places[0].address_components if "administrative_area_level_1" in c.types), None)
                country = next((c.short_text for c in response.places[0].address_components if "country" in c.types), None)
                
                updates = {}
                if state: updates["state"] = state
                if country: updates["country"] = country

                if updates:
                    await destinations_collection.update_one({"_id": doc["_id"]}, {"$set": updates})
                    logger.info(f"  -> Updated with: {updates}")
                if not state:
                    logger.warning(f"  -> No state component found for {name}.")
            else:
                logger.warning(f"  -> Google Places returned no results for {name}.")
        except Exception as e:
            logger.error(f"  -> Error processing {name}: {e}")

if __name__ == "__main__":
    asyncio.run(backfill_states())
import asyncio
import logging
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

from gemini_agent.clients import destinations_collection, places_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("fix_locations")

async def fix_locations():
    if destinations_collection is None or places_client is None:
        logger.error("Database or Places API client is not initialized. Check your credentials.")
        return

    cursor = destinations_collection.find({})
    docs = await cursor.to_list(length=None)

    logger.info(f"Checking {len(docs)} destinations to update their locations...")
    updated_count = 0

    # Define the field mask for the Places API
    mask = "places.location"

    for doc in docs:
        name = doc.get("name")
        state = doc.get("state")
        country = doc.get("country", "USA")
        
        # Build the full location string to search
        location_parts = [p for p in [name, state, country] if p]
        full_location = ", ".join(location_parts)

        logger.info(f"Geocoding '{full_location}' via Places API...")

        try:
            request = {"text_query": full_location, "included_type": "locality", "max_result_count": 1}
            response = await asyncio.to_thread(
                places_client.search_text, request=request, metadata=[("x-goog-fieldmask", mask)]
            )
            
            if response.places:
                lat = response.places[0].location.latitude
                lng = response.places[0].location.longitude
                
                new_location_obj = {"type": "Point", "coordinates": [lng, lat]}
                
                await destinations_collection.update_one({"_id": doc["_id"]}, {"$set": {"location": new_location_obj}})
                logger.info(f"  -> Updated location to [{lng}, {lat}]")
                updated_count += 1
            else:
                logger.warning(f"  -> No results found for {full_location}")
        except Exception as e:
            logger.error(f"  -> Error processing {full_location}: {e}")

        # Increased sleep to safely avoid Places API rate limits
        await asyncio.sleep(1.0)

    logger.info(f"Finished fixing locations. Updated {updated_count} destinations.")

if __name__ == "__main__":
    asyncio.run(fix_locations())
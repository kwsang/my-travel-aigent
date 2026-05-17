import asyncio
import logging
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

from gemini_agent.clients import destinations_collection, discovery_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("backfill_vibes")

VALID_VIBES = [
    "historic", "coastal", "romantic", "city", "urban", "mountain", 
    "nature", "beach", "desert", "adventure", "culture", "food", 
    "tropical", "winter"
]

async def backfill_vibes():
    if destinations_collection is None or discovery_client is None:
        logger.error("Database or discovery model is not initialized. Check your credentials.")
        return

    # Find destinations where 'vibe_tags' is missing or empty
    query = {"$or": [{"vibe_tags": {"$exists": False}}, {"vibe_tags": {"$size": 0}}]}
    cursor = destinations_collection.find(query)
    docs = await cursor.to_list(length=None)

    logger.info(f"Found {len(docs)} destinations requiring vibe_tags backfill.")

    for doc in docs:
        name = doc.get("name", "Unknown")
        desc = doc.get("description", "")
        logger.info(f"Generating vibes for '{name}'...")

        prompt = (
            f"Given the destination '{name}' with description '{desc}', "
            f"choose 2 to 4 of the most appropriate vibe tags from this exact list: {', '.join(VALID_VIBES)}. "
            f"Return ONLY the tags as a comma-separated list, nothing else."
        )

        try:
            response = await discovery_client.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt
            )
            suggested_tags = [t.strip().lower() for t in response.text.split(',')]
            valid_tags = [t for t in suggested_tags if t in VALID_VIBES]
            
            if valid_tags:
                await destinations_collection.update_one({"_id": doc["_id"]}, {"$set": {"vibe_tags": valid_tags}})
                logger.info(f"  -> Updated with vibes: {valid_tags}")
            else:
                logger.warning(f"  -> Model didn't return any valid vibes for {name}. Raw output: {response.text}")
        except Exception as e:
            logger.error(f"  -> Error processing {name}: {e}")

if __name__ == "__main__":
    asyncio.run(backfill_vibes())
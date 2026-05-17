import asyncio
import logging
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

from gemini_agent.clients import destinations_collection

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("clear_caches")

async def clear_caches():
    if destinations_collection is None:
        logger.error("Database connection is not initialized. Check your credentials.")
        return

    logger.info("Clearing corrupted suggested_lodging and suggested_activities...")
    
    result = await destinations_collection.update_many(
        {}, 
        {"$unset": {"suggested_lodging": "", "suggested_activities": ""}}
    )
    
    logger.info(f"Successfully cleared caches for {result.modified_count} destinations. The background task will now fetch fresh data!")

if __name__ == "__main__":
    asyncio.run(clear_caches())
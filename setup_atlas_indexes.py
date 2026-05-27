import os
import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, GEOSPHERE
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

async def setup_indexes():
    # Load environment variables (e.g., MONGODB_URI)
    load_dotenv()
    
    mongo_uri = os.getenv("MONGODB_URI")
    if not mongo_uri:
        logger.error("MONGODB_URI environment variable not set. Please check your .env file.")
        return

    # Initialize Motor client
    client = AsyncIOMotorClient(mongo_uri)
    db = client.get_default_database() 

    logger.info(f"Connected to database: {db.name}")
    logger.info("Setting up MongoDB Indexes...")

    # ---------------------------------------------------------
    # Phase 1: TTL Index for the Scratchpad
    # Expire documents 24 hours (86400 seconds) after 'created_at'
    # ---------------------------------------------------------
    await db["planning_scratchpad"].create_index(
        [("created_at", ASCENDING)],
        expireAfterSeconds=86400,
        name="ttl_scratchpad_24h"
    )
    logger.info("✅ Created TTL index on 'planning_scratchpad.created_at' (24 hours)")

    # ---------------------------------------------------------
    # Phase 2: 2dsphere Index for Geospatial Caching
    # Allows $near and $geoWithin queries on the 'location' field
    # ---------------------------------------------------------
    await db["places_cache"].create_index(
        [("location", GEOSPHERE)],
        name="2dsphere_location"
    )
    logger.info("✅ Created 2dsphere index on 'places_cache.location'")

    # ---------------------------------------------------------
    # Phase 3: Contextual Memory 
    # Fast lookup for traveler profiles across sessions
    # ---------------------------------------------------------
    await db["users"].create_index("user_id", unique=True)
    logger.info("✅ Created unique index on 'users.user_id'")

    logger.info("🎉 All index operations completed successfully!")

if __name__ == "__main__":
    asyncio.run(setup_indexes())
import os
import sys
import time
import logging
import voyageai
from pymongo import MongoClient, errors
from dotenv import load_dotenv

# Configure logging for better visibility during execution
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# 1. Setup Gemini Embeddings
# Load variables from .env file
load_dotenv()

# Use Voyage AI API Key
api_key = os.environ.get("VOYAGE_API_KEY")
if not api_key:
    logger.error("VOYAGE_API_KEY not found in environment or .env file.")
    sys.exit(1)

# Initialize Voyage AI Client
vo = voyageai.Client(api_key=api_key)

EMBEDDING_MODEL = "voyage-4"

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generates 1024-dimension embeddings for a list of texts using Voyage AI."""
    try:
        result = vo.embed(
            texts,
            model=EMBEDDING_MODEL,
            input_type="document"
        )
        return result.embeddings
    except Exception as e:
        logger.error(f"Failed to generate embeddings: {e}")
        if "Rate limit" in str(e):
            logger.warning("Voyage AI rate limit hit. Consider increasing delay or reducing batch size.")
        raise

# 2. Sample Data aligned with DATA_MODEL.md
destinations = [
    {
        "name": "Positano Pier",
        "country": "Italy",
        "description": "The iconic vertical village on the Amalfi Coast. Perfect for high-end dining, nautical tours, and luxury beach clubs.",
        "location": {"type": "Point", "coordinates": [14.4850, 40.6270]},
        "vibe_tags": ["luxury", "coastal", "nautical"],
        "price_tier": "$$$",
        "rating": 4.8
    },
    {
        "name": "Ericeira",
        "country": "Portugal",
        "description": "A charming fishing village turned world surfing reserve. Known for consistent waves and cobblestone streets.",
        "location": {"type": "Point", "coordinates": [-9.4185, 38.9633]},
        "vibe_tags": ["surfing", "relaxed", "coastal"],
        "price_tier": "$$",
        "rating": 4.5
    },
    {
        "name": "Sintra Mountains",
        "country": "Portugal",
        "description": "A fairytale landscape of palaces, castles, and mystical forests. Ideal for sightseeing and romantic walks.",
        "location": {"type": "Point", "coordinates": [-9.3907, 38.7993]},
        "vibe_tags": ["sightseeing", "romantic", "mountains"],
        "price_tier": "$$",
        "rating": 4.7
    }
]

# 3. Connect to Atlas
uri = os.environ.get("MONGODB_URI")
if not uri:
    logger.error("MONGODB_URI not found in environment or .env file.")
    sys.exit(1)

try:
    # Increased timeout to 30s to allow for cluster elections/network latency
    client = MongoClient(uri, serverSelectionTimeoutMS=30000)
    # Trigger a connection attempt to verify the URI and network access
    client.admin.command('ping')
    db = client["my-travel-aigent"]
    collection = db["destinations"]
except errors.ConnectionFailure as e:
    logger.error(f"Could not connect to MongoDB Atlas: {e}")
    sys.exit(1)

def seed():
    logger.info("Generating embeddings and seeding destinations...")
    success_count = 0
    
    # Batch size selected to stay under 10,000 tokens per minute
    # 3 Requests Per Minute limit = 1 request every 20 seconds
    batch_size = 50 

    for i in range(0, len(destinations), batch_size):
        batch = destinations[i : i + batch_size]
        descriptions = [d["description"] for d in batch]
        
        try:
            # Request embeddings for the batch
            embeddings = get_embeddings(descriptions)
            
            for idx, dest in enumerate(batch):
                dest["description_embedding"] = embeddings[idx]
                
                # Upsert based on name to avoid duplicates and allow updates
                result = collection.update_one(
                    {"name": dest["name"]},
                    {"$set": dest},
                    upsert=True
                )
                
                if result.upserted_id:
                    logger.info(f"Inserted: {dest['name']}")
                else:
                    logger.info(f"Updated: {dest['name']}")
                success_count += 1

            # Respect 3 RPM limit (1 request per 20s) if more batches remain
            if i + batch_size < len(destinations):
                logger.info("Rate limit cooling: sleeping for 20 seconds...")
                time.sleep(20)
            
        except Exception as e:
            logger.error(f"Failed to process batch starting at index {i}: {e}")

    logger.info(f"Successfully processed {success_count}/{len(destinations)} destinations.")

if __name__ == "__main__":
    seed()
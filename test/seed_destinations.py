import os
import sys
import time
import logging
import voyageai
import googlemaps
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

maps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
if not maps_key:
    logger.error("GOOGLE_MAPS_API_KEY not found in environment or .env file.")
    sys.exit(1)

# Initialize Voyage AI Client
vo = voyageai.Client(api_key=api_key)
# Initialize Google Maps Client
gmaps = googlemaps.Client(key=maps_key)

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

def fetch_destinations_from_google(vibe_queries: list[str]):
    """Uses Google Maps API to find real cities and towns based on search queries."""
    results = []

    for query in vibe_queries:
        logger.info(f"Searching Google Maps for: '{query}'")
        try:
            # Using the Google Maps library for a standard places text search
            response = gmaps.places(query=query)
            
            for place in response.get('results', []):
                # Strict City Filter: allow localities and primary sub-divisions
                types = place.get('types', [])
                geographic_types = {
                    'locality', 'sublocality', 'administrative_area_level_3', 'town'
                }
                
                if not any(t in geographic_types for t in types):
                    logger.debug(f"Skipping POI/Non-city: '{place.get('name')}' (Types: {types})")
                    continue
                
                logger.info(f"Validating destination: '{place.get('name')}'")

                dest_doc = {
                    "name": place.get('name'),
                    "country": "USA",
                    # Enforce city-specific description for better vector search
                    "description": f"The city of {place.get('name')}, located at {place.get('formatted_address')}.",
                    "location": {
                        "type": "Point",
                        # Map geometry returns lat/lng as discrete fields; GeoJSON standard is [longitude, latitude]
                        "coordinates": [place['geometry']['location']['lng'], place['geometry']['location']['lat']]
                    },
                    # Clean vibe tags: remove common query words to improve vector search filters
                    "vibe_tags": [word for word in query.lower().split() 
                                 if word not in ["cities", "towns", "in", "near", "with", "a", "of", "and", "ga", 
                                                "united", "states", "usa", "us", "top", "major", "popular", "most", 
                                                "visited", "destinations", "vacation", "spots", "centers"]],
                    "rating": place.get('rating', 4.5)
                }
                results.append(dest_doc)
            
            time.sleep(0.5)
        except Exception as e:
            logger.error(f"Google Search failed for '{query}': {e}")
            
    return results

# 2. Comprehensive Vibe Queries for US Major, Tourist, and Popular Cities
VIBE_QUERIES = [
    "Major cities in USA",
    "Tourist cities on the US East Coast",
    "Coastal cities in California",
    "Tourist cities in Florida",
    "Mountain cities in US Rockies",
    "Historic cities in the Southern US",
    "Tourist cities in the US Midwest",
    "Desert cities in the American Southwest",
    "Major cities in the Pacific Northwest",
    "Popular cities in New England"
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
    # Fetch fresh, real-world data from Google Places
    raw_destinations = fetch_destinations_from_google(VIBE_QUERIES)
    
    if not raw_destinations:
        logger.warning("No destinations found via Google API. Aborting seed.")
        return

    logger.info(f"Processing {len(raw_destinations)} city destinations for embeddings and Atlas upload...")
    success_count = 0
    
    batch_size = 20 
    for i in range(0, len(raw_destinations), batch_size):
        batch = raw_destinations[i : i + batch_size]
        descriptions = [d["description"] for d in batch]
        
        try:
            embeddings = get_embeddings(descriptions)
            
            for idx, dest in enumerate(batch):
                dest["description_embedding"] = embeddings[idx]
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

            if i + batch_size < len(raw_destinations):
                time.sleep(10)
        except Exception as e:
            logger.error(f"Failed to process batch starting at index {i}: {e}")

    logger.info(f"Successfully processed {success_count}/{len(raw_destinations)} real-world city destinations.")

if __name__ == "__main__":
    seed()
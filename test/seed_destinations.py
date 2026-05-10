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

def fetch_destinations_from_google(city_list: list[str]):
    """Uses Google Maps API to find real cities and towns based on a fixed list."""
    results = []

    for city_query in city_list:
        logger.info(f"Fetching geographic data for: '{city_query}'")
        try:
            # Search for specific city/state to ensure domestic accuracy
            response = gmaps.places(query=f"{city_query}, USA")
            
            if response.get('results'):
                # Take the most relevant first result for the specific city name
                place = response['results'][0]
                types = place.get('types', [])
                geographic_types = {'locality', 'sublocality', 'administrative_area_level_3', 'town'}
                
                if not any(t in geographic_types for t in types):
                    logger.debug(f"Skipping non-city result for '{city_query}': {types}")
                    continue

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
                    # Tags derived from the city and state name for filtering
                    "vibe_tags": [word.lower().strip(',') for word in city_query.split()],
                    "rating": place.get('rating', 4.5)
                }
                results.append(dest_doc)
            
            time.sleep(0.2) # Minor delay to respect quota
        except Exception as e:
            logger.error(f"Google API call failed for '{city_query}': {e}")
            
    return results

# 2. Top 100 US Major and Tourist Cities
TOP_US_CITIES = [
    "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ",
    "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "San Jose, CA",
    "Austin, TX", "Jacksonville, FL", "Fort Worth, TX", "Columbus, OH", "Charlotte, NC",
    "Indianapolis, IN", "San Francisco, CA", "Seattle, WA", "Denver, CO", "Oklahoma City, OK",
    "Nashville, TN", "El Paso, TX", "Washington, DC", "Las Vegas, NV", "Boston, MA",
    "Portland, OR", "Louisville, KY", "Memphis, TN", "Detroit, MI", "Baltimore, MD",
    "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ", "Fresno, CA", "Sacramento, CA",
    "Mesa, AZ", "Kansas City, MO", "Atlanta, GA", "Colorado Springs, CO", "Omaha, NE",
    "Raleigh, NC", "Virginia Beach, VA", "Long Beach, CA", "Miami, FL", "Oakland, CA",
    "Minneapolis, MN", "Tulsa, OK", "Bakersfield, CA", "Wichita, KS", "Arlington, TX",
    "Aurora, CO", "Tampa, FL", "New Orleans, LA", "Cleveland, OH", "Honolulu, HI",
    "Anaheim, CA", "Lexington, KY", "Stockton, CA", "Corpus Christi, TX", "Henderson, NV",
    "Riverside, CA", "Newark, NJ", "Saint Paul, MN", "Santa Ana, CA", "Cincinnati, OH",
    "Irvine, CA", "Orlando, FL", "Pittsburgh, PA", "St. Louis, MO", "Greensboro, NC",
    "Jersey City, NJ", "Anchorage, AK", "Lincoln, NE", "Plano, TX", "Durham, NC",
    "Buffalo, NY", "Chandler, AZ", "Chula Vista, CA", "Toledo, OH", "Madison, WI",
    "Gilbert, AZ", "Reno, NV", "Fort Wayne, IN", "North Las Vegas, NV", "St. Petersburg, FL",
    "Lubbock, TX", "Irving, TX", "Laredo, TX", "Winston-Salem, NC", "Chesapeake, VA",
    "Glendale, AZ", "Scottsdale, AZ", "Garland, TX", "Norfolk, VA", "Boise, ID",
    "Fremont, CA", "Richmond, VA", "Santa Clarita, CA", "Savannah, GA", "Duluth, GA",
    "Asheville, NC", "Charleston, SC", "Sedona, AZ", "Key West, FL", "Aspen, CO"
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
    # 1. Identify cities already present in MongoDB to avoid redundant API calls
    try:
        existing_names = set(collection.distinct("name"))
    except Exception as e:
        logger.error(f"Could not retrieve existing city names from MongoDB: {e}")
        existing_names = set()

    # 2. Filter the list: only fetch cities whose name isn't already in the database
    cities_to_fetch = [city for city in TOP_US_CITIES if city.split(',')[0].strip() not in existing_names]

    if not cities_to_fetch:
        logger.info("All targeted cities already exist in MongoDB. Skipping fetch.")
        return

    # 3. Fetch fresh data only for missing cities
    raw_destinations = fetch_destinations_from_google(cities_to_fetch)
    
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
import os
import sys
import time
import logging
import voyageai
import vertexai
from vertexai.generative_models import GenerativeModel
from google.maps import places_v1
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
# Initialize Google Places Client (New)
places_client = places_v1.PlacesClient(client_options={"api_key": maps_key})

# Initialize Vertex AI for city discovery
vertexai.init(project=os.environ.get("GOOGLE_CLOUD_PROJECT"), location="us-central1")

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

def get_cities_from_vibe(vibe_phrase):
    """Uses Gemini to find cities matching a specific vibe."""
    logger.info(f"Asking Gemini for cities matching vibe: '{vibe_phrase}'")
    model = GenerativeModel("gemini-2.5-flash-lite")
    prompt = (
        f"List 10 popular or major destinations that match this travel vibe: '{vibe_phrase}'. "
        "Return only a list of cities in the format 'City, State, Country' separated by newlines. "
        "Do not include any numbering or extra text."
    )
    try:
        response = model.generate_content(prompt)
        lines = response.text.strip().split('\n')
        cities = [line.strip() for line in lines if ',' in line]
        return cities
    except Exception as e:
        logger.error(f"Gemini city discovery failed: {e}")
        return []

def fetch_destinations_from_google(vibe_queries: list[str]):
    """Uses Gemini to discover cities and Google Maps API to fetch their metadata."""
    results = []
    # Stopwords to remove from queries when generating vibe_tags
    STOPWORDS = {"cities", "towns", "villages", "spots", "destinations", "in", "with", "a", "and", "the", "usa", "us", "major", "top", "popular", "best", "near", "spot"}
    # Field mask for the New Places API to specify required fields
    mask = "places.displayName,places.location,places.formattedAddress,places.types,places.addressComponents"

    for vibe_phrase in vibe_queries:
        # Extract keywords for vibe_tags from the descriptive phrase
        vibe_tags = [word.lower().strip(',') for word in vibe_phrase.split() if word.lower() not in STOPWORDS]
        
        # 1. Ask Gemini for cities that match this vibe
        cities_to_fetch = get_cities_from_vibe(vibe_phrase)
        
        for city_query in cities_to_fetch:
            logger.info(f"Fetching metadata for discovered city: '{city_query}'")
            try:
                # 2. Query Google Places for specific information about the discovered city
                request = {
                    "text_query": city_query,
                    "included_type": "locality",
                    "strict_type_filtering": True,
                    "max_result_count": 1
                }
                response = places_client.search_text(request=request, metadata=[("x-goog-fieldmask", mask)])
                
                for place in response.places:
                    types = place.types
                    geographic_types = {'locality', 'sublocality', 'administrative_area_level_3', 'town'}
                    
                    if not any(t in geographic_types for t in types):
                        continue

                    state = ""
                    country = "USA"
                    for component in place.address_components:
                        if "administrative_area_level_1" in component.types:
                            state = component.short_text
                        if "country" in component.types:
                            country = component.short_text

                    dest_doc = {
                        "name": place.display_name.text,
                        "state": state,
                        "country": country,
                        # High-fidelity semantic description
                        "description": (f"The city of {place.display_name.text}. A destination found for its "
                                       f"'{vibe_phrase}' characteristics, located in "
                                       f"{place.formatted_address}."),
                        "location": {
                            "type": "Point",
                            "coordinates": [place.location.longitude, place.location.latitude]
                        },
                        "vibe_tags": vibe_tags,
                    }
                    results.append(dest_doc)
                
                time.sleep(0.5) 
            except Exception as e:
                logger.error(f"Google fetch failed for '{city_query}': {e}")
            
    return results

# 2. Vibe Discovery Queries
VIBE_DISCOVERY_QUERIES = [
    "Most popular affordable cities for travelers",
    "Top-rated budget-friendly vacation spots",
    "Most beautiful cities with mountain views",
    "Popular coastal cities for summer",
    "Best cities for nightlife and entertainment",
    "Iconic bucket-list cities"
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
    # 1. Identify cities already present in MongoDB to avoid redundant processing
    try:
        existing_names = set(collection.distinct("name"))
    except Exception as e:
        logger.error(f"Could not retrieve existing city names from MongoDB: {e}")
        existing_names = set()

    # 2. Fetch and Discover data from Google
    raw_destinations = fetch_destinations_from_google(VIBE_DISCOVERY_QUERIES)
    
    if not raw_destinations:
        logger.warning("No destinations found via Google API. Aborting seed.")
        return

    # 3. Process results: identify new cities for embeddings and update tags for existing ones
    # We use a map to consolidate tags for new cities found across different queries in this run.
    cities_to_process_map = {}
    for d in raw_destinations:
        name = d["name"]
        if name in existing_names:
            # City exists: update vibe tags using $addToSet to avoid duplicates
            try:
                collection.update_one(
                    {"name": name},
                    {"$addToSet": {"vibe_tags": {"$each": d["vibe_tags"]}}}
                )
                logger.info(f"Updated vibe tags for existing city: {name}")
            except Exception as e:
                logger.error(f"Failed to update tags for {name}: {e}")
        elif name not in cities_to_process_map:
            cities_to_process_map[name] = d
        else:
            # Consolidate tags for new cities found multiple times in this session
            combined_tags = set(cities_to_process_map[name]["vibe_tags"])
            combined_tags.update(d["vibe_tags"])
            cities_to_process_map[name]["vibe_tags"] = list(combined_tags)

    cities_to_process = list(cities_to_process_map.values())

    if not cities_to_process:
        logger.info("No new cities found. Database update complete.")
        return

    logger.info(f"Processing {len(cities_to_process)} new cities for embeddings and Atlas upload...")
    success_count = 0
    
    batch_size = 20 
    for i in range(0, len(cities_to_process), batch_size):
        batch = cities_to_process[i : i + batch_size]
        descriptions = [d["description"] for d in batch]
        
        try:
            embeddings = get_embeddings(descriptions)
            
            for idx, dest in enumerate(batch):
                dest["description_embedding"] = embeddings[idx]
                collection.insert_one(dest)
                logger.info(f"Inserted: {dest['name']}")
                success_count += 1

            if i + batch_size < len(cities_to_process):
                time.sleep(10)
        except Exception as e:
            logger.error(f"Failed to process batch starting at index {i}: {e}")

    logger.info(f"Successfully processed {success_count} new real-world city destinations.")

if __name__ == "__main__":
    seed()
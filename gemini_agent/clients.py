import os
import logging
import voyageai
import googlemaps
import vertexai
from vertexai.generative_models import GenerativeModel
from pymongo import MongoClient
from google.maps import places_v1
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Project Config
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Initialize Vertex AI context
try:
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    logger.info("Vertex AI initialized (Project: %s, Location: %s)", PROJECT_ID, LOCATION)
except Exception:
    logger.exception("Failed to initialize Vertex AI context")

# Initialize clients globally
try:
    voyage_client = voyageai.Client(api_key=os.environ.get("VOYAGE_API_KEY"))
    logger.info("Voyage AI client initialized.")
except Exception:
    logger.exception("Failed to initialize Voyage AI client")
    voyage_client = None

try:
    mongo_client = MongoClient(os.environ.get("MONGODB_URI"))
    db = mongo_client["my-travel-aigent"]
    destinations_collection = db["destinations"]
    # Verify MongoDB connection (MongoClient is lazy)
    mongo_client.admin.command('ping')
    logger.info("MongoDB connection verified (Database: %s)", db.name)
except Exception:
    logger.exception("Failed to initialize or connect to MongoDB")
    mongo_client = db = destinations_collection = None

try:
    places_client = places_v1.PlacesClient(client_options={"api_key": os.getenv("GOOGLE_MAPS_API_KEY")})
    gmaps_client = googlemaps.Client(key=os.getenv("GOOGLE_MAPS_API_KEY"))
    logger.info("Google Maps & Places clients initialized.")
except Exception:
    logger.exception("Failed to initialize Google Maps or Places clients")
    places_client = gmaps_client = None

try:
    discovery_model = GenerativeModel("gemini-1.5-flash")
    logger.info("Discovery model (gemini-1.5-flash) initialized.")
except Exception:
    logger.exception("Failed to initialize discovery model (gemini-1.5-flash)")
    discovery_model = None
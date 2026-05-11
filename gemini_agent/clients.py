import os
import logging
import voyageai
import googlemaps
import vertexai
from vertexai.generative_models import GenerativeModel
from google.cloud import secretmanager
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

def get_secret(secret_id: str, default: str = None) -> str:
    """
    Helper to fetch secrets from Google Cloud Secret Manager.
    Falls back to environment variables for local development compatibility.
    """
    # Optimization: Check environment first (Cloud Run injected or local .env)
    env_val = os.getenv(secret_id)
    if env_val:
        return env_val

    # If we don't have a project ID, we are likely local; skip API call.
    if not PROJECT_ID:
        return os.getenv(secret_id, default)

    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_ID}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        logger.warning(f"Could not fetch secret {secret_id} from Secret Manager: {e}")
        return os.getenv(secret_id, default)

# Resolve MONGODB_URI via Secret Manager or Environment
MONGODB_URI = get_secret("MONGODB_URI")
if not MONGODB_URI:
    logger.error("MONGODB_URI could not be resolved from Secret Manager or Environment.")

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
    mongo_client = MongoClient(MONGODB_URI)
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
    discovery_model = GenerativeModel("gemini-2.5-flash")
    logger.info("Discovery model (gemini-2.5-flash) initialized.")
except Exception:
    logger.exception("Failed to initialize discovery model (gemini-2.5-flash)")
    discovery_model = None
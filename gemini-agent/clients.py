import os
import voyageai
import googlemaps
from pymongo import MongoClient
from google.maps import places_v1
from dotenv import load_dotenv

load_dotenv()

# Project Config
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Initialize clients globally
voyage_client = voyageai.Client(api_key=os.environ.get("VOYAGE_API_KEY"))
mongo_client = MongoClient(os.environ.get("MONGODB_URI"))
db = mongo_client["my-travel-aigent"]
destinations_collection = db["destinations"]

places_client = places_v1.PlacesClient(client_options={"api_key": os.getenv("GOOGLE_MAPS_API_KEY")})
gmaps_client = googlemaps.Client(key=os.getenv("GOOGLE_MAPS_API_KEY"))
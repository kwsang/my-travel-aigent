import os
import sys
import google.generativeai as genai
from pymongo import MongoClient
from dotenv import load_dotenv

# 1. Setup Gemini Embeddings
# Load variables from .env file
load_dotenv()

# Make sure GOOGLE_API_KEY is in your environment variables
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("Error: GOOGLE_API_KEY not found in environment or .env file.")
    sys.exit(1)

genai.configure(api_key=api_key)

def get_embedding(text):
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document"
    )
    return result['embedding']

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
    }
]

# 3. Connect to Atlas
# Replace with your travel-aigent-cluster URI
uri = os.environ.get("MONGODB_URI", "mongodb+srv://user:pass@travel-aigent-cluster.mongodb.net/")
client = MongoClient(uri)
db = client["my-travel-aigent"]
collection = db["destinations"]

def seed():
    print("Generating embeddings and seeding destinations...")
    for dest in destinations:
        # Generate the vector for the description
        dest["description_embedding"] = get_embedding(dest["description"])
        
        # Upsert based on name
        collection.update_one(
            {"name": dest["name"]},
            {"$set": dest},
            upsert=True
        )
    print(f"Successfully seeded {len(destinations)} destinations.")

if __name__ == "__main__":
    seed()
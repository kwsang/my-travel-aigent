import os
import sys
import logging
import voyageai
from pymongo import MongoClient, errors
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Voyage AI and MongoDB
vo = voyageai.Client(api_key=os.environ.get("VOYAGE_API_KEY"))
uri = os.environ.get("MONGODB_URI")

try:
    client = MongoClient(uri, serverSelectionTimeoutMS=30000)
    client.admin.command('ping')
    db = client["my-travel-aigent"]
    collection = db["destinations"]
except errors.PyMongoError as e:
    logger.error(f"MongoDB Connection Error: {e}")
    sys.exit(1)

def test_semantic_search(query_text: str):
    print(f"\n--- Searching for: '{query_text}' ---")
    
    # 1. Generate query embedding (Note: input_type is 'query')
    query_embedding = vo.embed([query_text], model="voyage-4", input_type="query").embeddings[0]

    # 2. Execute Vector Search Aggregation
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "description_embedding",
                "queryVector": query_embedding,
                "numCandidates": 100,
                "limit": 3
            }
        },
        {
            "$project": {
                "_id": 0,
                "name": 1,
                "description": 1,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ]

    results = list(collection.aggregate(pipeline))
    for res in results:
        print(f"Result: {res['name']} (Score: {res['score']:.4f})\n   {res['description']}")

if __name__ == "__main__":
    # Test with a semantic query not explicitly in the names
    test_semantic_search("romantic castles and palaces in Portugal")
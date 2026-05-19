import os
import sys
import asyncio
import logging

# Add the project root to the python path so we can import gemini_agent modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gemini_agent.clients import places_client, voyage_client, destinations_collection

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def get_embedding(text: str) -> list[float]:
    """Generates a semantic embedding using Voyage AI."""
    # Voyage client is synchronous, so we run it in a thread to keep the loop unblocked
    response = await asyncio.to_thread(
        voyage_client.embed, [text], model="voyage-3", input_type="document"
    )
    return response.embeddings[0]

async def sync_places_for_destination(destination_name: str, query_suffix: str):
    """Queries Google Places for a specific vibe/category and upserts to MongoDB with embeddings."""
    query = f"{query_suffix} in {destination_name}"
    logger.info(f"Searching Google Places for: {query}")
    
    # 1. Fetch from Google Places API
    mask = "places.id,places.displayName,places.formattedAddress,places.types,places.editorialSummary,places.rating"
    request = {
        "text_query": query,
        "max_result_count": 20
    }
    
    response = await asyncio.to_thread(
        places_client.search_text,
        request=request,
        metadata=[("x-goog-fieldmask", mask)]
    )
    
    db = destinations_collection.database
    places_coll = db["places"]
    
    for place in response.places:
        place_id = place.id
        
        # Skip embedding generation if the place is already safely cached in our database
        existing = await places_coll.find_one({"place_id": place_id})
        if existing:
            continue
            
        name = place.display_name.text if place.display_name else "Unknown"
        address = place.formatted_address
        types = list(place.types) if place.types else []
        summary = place.editorial_summary.text if place.editorial_summary else ""
        
        # 2. Construct a rich text representation for the Vector Embedding
        embed_text = f"Name: {name}. Categories: {', '.join(types)}. Description: {summary}. Address: {address}."
        
        try:
            embedding = await get_embedding(embed_text)
        except Exception as e:
            logger.error(f"Failed to get embedding for {name}: {e}")
            continue
            
        # 3. Upsert into MongoDB
        place_doc = {
            "place_id": place_id,
            "name": name,
            "address": address,
            "types": types,
            "description": summary,
            "rating": place.rating,
            "destination": destination_name,
            "embedding": embedding
        }
        
        await places_coll.update_one({"place_id": place_id}, {"$set": place_doc}, upsert=True)
        logger.info(f"Successfully synced & embedded: {name}")

async def main():
    if destinations_collection is None:
        logger.error("MongoDB is not initialized. Check your environment variables.")
        return
        
    logger.info("Starting Place Synchronization Cron Job...")
    
    # Fetch all known destinations from the database and populate top places
    cursor = destinations_collection.find({}, {"name": 1})
    destinations = await cursor.to_list(length=None)
    
    for dest in destinations:
        dest_name = dest.get("name")
        if not dest_name:
            continue
        
        logger.info(f"--- Syncing places for destination: {dest_name} ---")
        await sync_places_for_destination(dest_name, "top attractions and landmarks")
        await sync_places_for_destination(dest_name, "best highly rated restaurants")
        await sync_places_for_destination(dest_name, "best hotels and lodging")
        
    logger.info("Cron job completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
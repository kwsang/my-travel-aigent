import json
import logging
import asyncio
from typing import Dict, Any
from gemini_agent.clients import voyage_client
from .phase1_state_tools import get_db

logger = logging.getLogger(__name__)

async def get_embedding(text: str, input_type: str = "document") -> list[float]:
    """Generates a semantic embedding using Voyage AI."""
    if not voyage_client:
        raise ValueError("Voyage AI client is not initialized.")
    response = await asyncio.to_thread(
        voyage_client.embed, [text], model="voyage-4", input_type=input_type
    )
    return response.embeddings[0]

async def cache_successful_itinerary(itinerary_json: str, rating: int = 5) -> str:
    """
    Saves a finalized, highly-rated itinerary to the successful_trips collection
    for long-term memory and semantic few-shot prompting.
    
    Args:
        itinerary_json: The stringified JSON of the final Itinerary.
        rating: An integer rating (1-5) representing user satisfaction.
    """
    if rating < 4:
        return "Itinerary rating too low to cache as a successful example."

    try:
        itinerary = json.loads(itinerary_json)
    except Exception as e:
        return f"Error parsing itinerary JSON: {e}"

    db = get_db()
    
    trip_name = itinerary.get("trip_name", "Unknown Trip")
    destination = itinerary.get("destination", "")
    events = itinerary.get("events", [])
    
    # Create a dense text representation for semantic vector matching
    activities = [e.get("details", {}).get("name", "") for e in events if e.get("segment") == "EXPERIENCE"]
    text_to_embed = f"Trip: {trip_name} to {destination}. Features: {', '.join(activities)}."
    
    try:
        embedding = await get_embedding(text_to_embed)
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        return f"Failed to cache itinerary: {e}"

    doc = {
        "trip_name": trip_name,
        "destination": destination,
        "itinerary_data": itinerary,
        "rating": rating,
        "embedding": embedding,
        "search_text": text_to_embed
    }
    
    try:
        await db.successful_trips.update_one(
            {"trip_name": trip_name, "destination": destination},
            {"$set": doc},
            upsert=True
        )
        return f"Successfully cached '{trip_name}' for future semantic retrieval."
    except Exception as e:
        return f"Database error caching itinerary: {e}"

async def search_past_itineraries(query: str) -> str:
    """
    Searches the database for past successful itineraries matching the semantic vibe or destination.
    Use this to find few-shot examples or inspiration from past successful trips.
    
    Args:
        query: The vibe, destination, or type of trip (e.g., 'romantic weekend in Paris', 'budget family trip').
    """
    db = get_db()
    try:
        query_embedding = await get_embedding(query, input_type="query")
    except Exception as e:
        logger.error(f"Failed to embed search query: {e}")
        return "Semantic search unavailable at the moment."
        
    pipeline = [
        {"$vectorSearch": {"index": "vector_index", "path": "embedding", "queryVector": query_embedding, "numCandidates": 20, "limit": 2}},
        {"$project": {"_id": 0, "trip_name": 1, "destination": 1, "itinerary_data": 1, "score": {"$meta": "vectorSearchScore"}}}
    ]
    
    try:
        results = await db.successful_trips.aggregate(pipeline).to_list(length=2)
        if not results:
            return "No matching past itineraries found."
            
        # Simplify output to save tokens
        simplified = [{"trip_name": r.get("trip_name"), "destination": r.get("destination"), "events": [{"day": e.get("day"), "name": e.get("details", {}).get("name")} for e in r.get("itinerary_data", {}).get("events", []) if e.get("segment") in ["EXPERIENCE", "DINING"]]} for r in results]
        return json.dumps(simplified)
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return "Vector search failed. Ensure the 'vector_index' is created on the 'successful_trips' collection in the Atlas UI."
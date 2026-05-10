import datetime
from typing import Any
from ..clients import destinations_collection

def save_itinerary(itinerary: dict, tool_context: Any) -> str:
    """
    Persists a finalized, multi-day travel itinerary to MongoDB Atlas.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        itinerary["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = db["itineraries"].insert_one(itinerary)
        return f"SUCCESS: Itinerary saved with ID {result.inserted_id}."
    except Exception as e:
        return f"Error saving itinerary: {str(e)}"
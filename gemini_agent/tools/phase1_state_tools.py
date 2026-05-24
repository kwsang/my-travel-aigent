import os
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Lazy-load db client for pooling efficiency
_client = None

def get_db():
    global _client
    if _client is None:
        load_dotenv()
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            raise ValueError("MONGODB_URI environment variable is not set.")
        _client = AsyncIOMotorClient(mongo_uri)
    return _client.get_default_database()


async def read_draft_itinerary(user_id: str) -> Dict[str, Any]:
    """
    Reads the active draft itinerary for a given user from MongoDB.
    Use this to understand the current state of the trip before suggesting new events.
    
    Args:
        user_id: The ID of the user (e.g., 'user_123').
    """
    db = get_db()
    itinerary = await db.itineraries.find_one(
        {"user_id": user_id, "status": "draft"},
        {"_id": 0}  # Omit ObjectId for clean JSON return to the LLM
    )
    return itinerary or {"message": "No active draft itinerary found for this user."}


async def calculate_budget(user_id: str) -> Dict[str, Any]:
    """
    Calculates the current total estimated cost of the active draft itinerary 
    and compares it to the user's budget limit.
    
    Args:
        user_id: The ID of the user.
    """
    db = get_db()
    
    # 1. Fetch Draft Itinerary
    itinerary = await db.itineraries.find_one({"user_id": user_id, "status": "draft"})
    if not itinerary:
        return {"error": "No draft itinerary found to calculate."}
        
    # 2. Fetch User Profile for Budget Limit
    user_profile = await db.users.find_one({"user_id": user_id})
    budget_limit = 0.0
    if user_profile and "preferences" in user_profile:
        budget_limit = float(user_profile["preferences"].get("budget", {}).get("total_limit", 0))

    # 3. Sum all events
    total_cost = 0.0
    currency = "USD"
    
    for event in itinerary.get("events", []):
        price_info = event.get("details", {}).get("price", {})
        if price_info:
            total_cost += float(price_info.get("amount", 0.0))
            currency = price_info.get("currency", "USD") 
            
    remaining = max(0.0, budget_limit - total_cost) if budget_limit > 0 else None
    is_over_budget = total_cost > budget_limit if budget_limit > 0 else False

    return {
        "total_estimated_cost": total_cost,
        "budget_limit": budget_limit,
        "remaining_budget": remaining,
        "currency": currency,
        "is_over_budget": is_over_budget
    }


async def save_to_scratchpad(session_id: str, data_type: str, items: List[Dict[str, Any]]) -> str:
    """
    Saves temporary data (like massive Google Places search results) to the MongoDB scratchpad.
    This keeps the LLM context window clean. Data expires after 24 hours.
    
    Args:
        session_id: The current chat session ID.
        data_type: The type of data (e.g., 'restaurants', 'hotels').
        items: A list of dictionaries containing the raw data.
    """
    if not items:
        return "No items to save."
        
    db = get_db()
    document = {
        "session_id": session_id,
        "data_type": data_type,
        "items": items,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.planning_scratchpad.insert_one(document)
    return f"Successfully saved {len(items)} {data_type} to the scratchpad collection. Query them using get_top_items_from_scratchpad."


async def get_top_items_from_scratchpad(session_id: str, data_type: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Retrieves the top N items of a specific type from the session's scratchpad.
    Use this to pull exactly what you need without overwhelming the context window.
    
    Args:
        session_id: The current chat session ID.
        data_type: The type of data to retrieve (must match what was used in save_to_scratchpad).
        limit: Maximum number of items to return (default is 3).
    """
    db = get_db()
    doc = await db.planning_scratchpad.find_one(
        {"session_id": session_id, "data_type": data_type},
        sort=[("created_at", -1)], # Get the most recent scratchpad entry
        projection={"_id": 0, "items": 1}
    )
    
    if doc and "items" in doc:
        return doc["items"][:limit]
    return []
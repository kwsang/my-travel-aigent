import json
import datetime
from typing import Any, Optional
from gemini_agent.clients import destinations_collection
from .models import Itinerary

def save_itinerary(itinerary: Itinerary, tool_context: Any) -> str:
    """
    Persists a finalized, multi-day travel itinerary to MongoDB Atlas.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        # Add creation timestamp to metadata before saving
        itinerary.metadata["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

        db = destinations_collection.database
        result = db["itineraries"].insert_one(itinerary.model_dump())
        return f"SUCCESS: Itinerary saved with ID {result.inserted_id}."
    except Exception as e:
        return f"Error saving itinerary: {str(e)}"

def get_itinerary(user_id: str, trip_name: Optional[str] = None, tool_context: Any = None) -> str:
    """
    Retrieves saved itineraries for a given user from MongoDB Atlas.
    If trip_name is provided, it filters for that specific trip.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        query = {"user_id": user_id}
        if trip_name:
            query["trip_name"] = trip_name

        results = list(db["itineraries"].find(query))
        if not results:
            msg = f"No itineraries found for user '{user_id}'"
            if trip_name:
                msg += f" with name '{trip_name}'"
            return msg + "."

        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error retrieving itinerary: {str(e)}"

def delete_itinerary(user_id: str, trip_name: str, tool_context: Any = None) -> str:
    """
    Deletes a specific itinerary for a given user from MongoDB Atlas by trip name.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        result = db["itineraries"].delete_one({"user_id": user_id, "trip_name": trip_name})
        
        if result.deleted_count == 0:
            return f"No itinerary found with name '{trip_name}' for user '{user_id}'."
            
        return f"SUCCESS: Itinerary '{trip_name}' has been deleted."
    except Exception as e:
        return f"Error deleting itinerary: {str(e)}"

def update_itinerary_status(user_id: str, trip_name: str, status: str, tool_context: Any = None) -> str:
    """
    Updates the status of a specific itinerary (e.g., from 'draft' to 'final').
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if status not in ["draft", "final"]:
            return f"Error: Invalid status '{status}'. Must be 'draft' or 'final'."

        db = destinations_collection.database
        result = db["itineraries"].update_one(
            {"user_id": user_id, "trip_name": trip_name},
            {"$set": {
                "status": status, 
                "metadata.updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            return f"No itinerary found with name '{trip_name}' for user '{user_id}'."
            
        return f"SUCCESS: Itinerary '{trip_name}' status updated to '{status}'."
    except Exception as e:
        return f"Error updating itinerary status: {str(e)}"

def clone_itinerary(user_id: str, source_trip_name: str, new_trip_name: str, tool_context: Any = None) -> str:
    """
    Creates a new draft itinerary by cloning an existing one.
    Useful for exploring variations of a trip while keeping the original plan intact.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        source_doc = db["itineraries"].find_one({"user_id": user_id, "trip_name": source_trip_name})
        
        if not source_doc:
            return f"Error: Source itinerary '{source_trip_name}' not found for user '{user_id}'."

        # Prevent overwriting an existing trip with the same new name
        if db["itineraries"].find_one({"user_id": user_id, "trip_name": new_trip_name}):
            return f"Error: An itinerary named '{new_trip_name}' already exists for this user."

        # Strip the MongoDB ID and validate into the model
        source_doc.pop("_id", None)
        itinerary = Itinerary.model_validate(source_doc)
        
        # Update identifying details
        itinerary.trip_name = new_trip_name
        itinerary.status = "draft"
        itinerary.metadata["cloned_from"] = source_trip_name
        itinerary.metadata["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        db["itineraries"].insert_one(itinerary.model_dump())
        return f"SUCCESS: Itinerary '{source_trip_name}' cloned to '{new_trip_name}' as a draft."
    except Exception as e:
        return f"Error cloning itinerary: {str(e)}"

def list_trip_versions(user_id: str, source_trip_name: str, tool_context: Any = None) -> str:
    """
    Retrieves all draft versions cloned from a specific itinerary.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        query = {
            "user_id": user_id,
            "status": "draft",
            "metadata.cloned_from": source_trip_name
        }

        results = list(db["itineraries"].find(query))
        if not results:
            return f"No draft versions found cloned from '{source_trip_name}' for user '{user_id}'."

        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error listing trip versions: {str(e)}"

def finalize_itinerary(user_id: str, trip_name: str, tool_context: Any) -> str:
    """
    Finalizes the trip by updating its status to 'final' and ensuring the latest 
    state from the agent's memory is persisted to MongoDB.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        state = tool_context.state
        
        # 1. Search for the itinerary in agent memory
        # Architect agent uses 'final_itinerary', general tools might use 'active_itinerary'
        raw_itinerary = state.get("final_itinerary") or state.get("active_itinerary")
        
        # If the data in memory matches the requested trip_name, use it for persistence
        if isinstance(raw_itinerary, dict) and raw_itinerary.get("trip_name") == trip_name:
            # Validate/Hydrate into the Pydantic model for schema consistency
            itinerary = Itinerary.model_validate(raw_itinerary)
            
            # Transition to 'final'
            itinerary.status = "final"
            itinerary.metadata["finalized_at"] = now
            itinerary.metadata["updated_at"] = now
            itinerary.user_id = user_id # Ensure ownership
            
            # Upsert into MongoDB to ensure latest edits are captured
            db["itineraries"].update_one(
                {"user_id": user_id, "trip_name": trip_name},
                {"$set": itinerary.model_dump()},
                upsert=True
            )
            
            # Sync the finalized version back to state keys to avoid stale memory
            final_data = itinerary.model_dump()
            state.update({
                "active_itinerary": final_data,
                "final_itinerary": final_data
            })
            return f"SUCCESS: Active itinerary '{trip_name}' has been finalized and persisted to your profile."
        
        # 2. Fallback: If not in memory, just update the status of the existing record in DB
        result = db["itineraries"].update_one(
            {"user_id": user_id, "trip_name": trip_name},
            {"$set": {
                "status": "final",
                "metadata.finalized_at": now,
                "metadata.updated_at": now
            }}
        )
        
        if result.matched_count == 0:
            return f"Error: No saved itinerary found with name '{trip_name}' to finalize."
            
        return f"SUCCESS: Saved itinerary '{trip_name}' marked as final in the database."
        
    except Exception as e:
        return f"Error finalizing itinerary: {str(e)}"
import json
import datetime
import logging
import re
import ast
from typing import Any, Optional
from gemini_agent.clients import destinations_collection
from gemini_agent.logic.models import Itinerary
from google.adk.agents.invocation_context import InvocationContext

logger = logging.getLogger(__name__)

def _parse_json_or_literal(raw_str: str, default_val: Any) -> Any:
    if not isinstance(raw_str, str):
        return raw_str
    s = raw_str.strip()
    if not s:
        return default_val
        
    # Clean up non-breaking spaces (LLM formatting hallucination)
    s = s.replace('\xa0', ' ')

    match = re.search(r'```(?:json)?\s*(.*?)\s*```', s, re.DOTALL | re.IGNORECASE)
    if match:
        s = match.group(1).strip()
        
    # Auto-fix truncated JSON arrays common in LLM outputs
    if s.startswith('[') and not s.endswith(']'):
        s += ']'
    elif s.startswith('{') and not s.endswith('}'):
        s += '}'

    # 1. Try JSON parsing. Replace invalid single-quote escapes first.
    try:
        s_json = s.replace("\\'", "'")
        return json.loads(s_json, strict=False)
    except json.JSONDecodeError:
        # 2. Fallback to Python literal evaluation
        try:
            s_py = re.sub(r'\btrue\b', 'True', s)
            s_py = re.sub(r'\bfalse\b', 'False', s_py)
            s_py = re.sub(r'\bnull\b', 'None', s_py)
            return ast.literal_eval(s_py)
        except Exception:
            raise ValueError(f"Could not parse string as JSON or Python literal. String was: {s[:100]}...")

async def save_itinerary(
    events: str,
    tool_context: InvocationContext,
    destination: str = None,
    lodging: str = None,
) -> str:
    """
    Persists a travel itinerary to MongoDB Atlas. 
    Updates the existing draft for this session if it exists, otherwise creates it.

    Args:
        events: A JSON string representing the FULL, complete array of itinerary events. Must include all previously scheduled events.
        destination: The confirmed destination city (e.g., 'Savannah, GA, USA').
        lodging: A JSON string representing the selected lodging object.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."

        # Capture context and timestamps for iterative updates
        session_id = tool_context.session.id
        user_id = tool_context.session.user_id
        
        # Merge with existing state to prevent data loss if the LLM omits optional fields
        existing_state = tool_context.state.get("final_itinerary")
        if isinstance(existing_state, str):
            try: existing_state = json.loads(existing_state)
            except: existing_state = {}
        if not existing_state:
            existing_state = {}

        parsed_events = []
        if isinstance(events, str):
            try: 
                parsed_events = _parse_json_or_literal(events, [])
            except Exception as e:
                logger.error(f"Error parsing 'events' JSON: {str(e)}")
                return f"Error parsing 'events' JSON: {str(e)}"
        elif isinstance(events, list):
            parsed_events = events
            
        parsed_lodging = None
        if isinstance(lodging, str):
            try: 
                parsed_lodging = _parse_json_or_literal(lodging, None)
            except Exception as e:
                logger.error(f"Error parsing 'lodging' JSON: {str(e)}")
                return f"Error parsing 'lodging' JSON: {str(e)}"
        elif isinstance(lodging, dict):
            parsed_lodging = lodging

        route_cache = tool_context.state.get("_route_cache", {})
        venue_cache = tool_context.state.get("_venue_cache", {})
        existing_events = existing_state.get("events", [])
        for new_ev in parsed_events:
            if not isinstance(new_ev, dict): continue
            details = new_ev.get("details", {})
            if not isinstance(details, dict): continue
            
            name = details.get("name")
            if name and name in venue_cache:
                cached_venue = venue_cache[name]
                for k, v in cached_venue.items():
                    if k not in details:
                        details[k] = v
            
            if "polyline" in details and isinstance(details["polyline"], str):
                token = details["polyline"]
                if token.startswith("route_") and token in route_cache:
                    details["polyline"] = route_cache[token]
                    
            if "polyline" not in details or not details["polyline"]:
                for old_ev in existing_events:
                    old_details = old_ev.get("details", {})
                    if old_details.get("name") == details.get("name") and "polyline" in old_details:
                        details["polyline"] = old_details["polyline"]
                        break

        if parsed_lodging:
            name = parsed_lodging.get("name")
            if name and name in venue_cache:
                for k, v in venue_cache[name].items():
                    if k not in parsed_lodging:
                        parsed_lodging[k] = v

        # Deep equality check to prevent redundant saves from the LLM
        has_changes = False
        if destination and destination != existing_state.get("destination"):
            has_changes = True
        if parsed_lodging and parsed_lodging != existing_state.get("lodging"):
            has_changes = True
        if parsed_events != existing_state.get("events", []):
            has_changes = True
            
        if not has_changes:
            logger.info(f"save_itinerary bypassed for session {session_id}: Payload is identical to current state.")
            return f"SUCCESS: Itinerary is already up to date. No changes were necessary."

        # Prepare document data with session linkage for UI synchronization
        # Merge incoming data over existing state
        merged_data = {**existing_state}
        if destination: merged_data["destination"] = destination
        if parsed_lodging: merged_data["lodging"] = parsed_lodging
        merged_data["events"] = parsed_events
        
        if "trip_name" not in merged_data: merged_data["trip_name"] = "New Trip"
        if "duration_days" not in merged_data: merged_data["duration_days"] = 0
        if "party_size_total" not in merged_data: merged_data["party_size_total"] = 1

        itinerary_obj = Itinerary.model_validate(merged_data)
        itinerary_data = itinerary_obj.model_dump()
        
        itinerary_data["session_id"] = session_id
        itinerary_data["user_id"] = user_id # Enforce consistency with session identity
        itinerary_data["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        itinerary_data.pop("_id", None)

        db = destinations_collection.database
        # Use session_id as the primary anchor to ensure we update the same draft
        result = await db["itineraries"].update_one(
            {"session_id": session_id, "user_id": user_id},
            {"$set": itinerary_data},
            upsert=True
        )
        
        # CRITICAL: Update the agent's memory state so subsequent agents see the saved events!
        tool_context.state.update({"final_itinerary": itinerary_data, "active_itinerary": itinerary_data})

        if result.upserted_id:
            return f"SUCCESS: New draft itinerary created for session {session_id}."
        return f"SUCCESS: Draft itinerary updated for session {session_id}."
    except Exception as e:
        logger.error(f"CRITICAL: Validation error while saving itinerary: {str(e)}")
        return f"Error saving itinerary: {str(e)}"

async def get_itinerary(tool_context: InvocationContext, trip_name: Optional[str] = None) -> str:
    """
    Retrieves saved itineraries for a given user from MongoDB Atlas.
    If trip_name is provided, it filters for that specific trip.
    """
    logger.info(f"Tool invoked: get_itinerary for trip_name '{trip_name}'")
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        user_id = tool_context.session.user_id
        db = destinations_collection.database
        query = {"user_id": user_id}
        if trip_name:
            query["trip_name"] = trip_name

        results = await db["itineraries"].find(query).to_list(length=None)
        if not results:
            msg = f"No itineraries found for user '{user_id}'"
            if trip_name:
                msg += f" with name '{trip_name}'"
            return msg + "."

        # Strip massive polyline strings to save tokens and prevent agent context overflow
        for res in results:
            for event in res.get("events", []):
                if isinstance(event, dict) and "details" in event and isinstance(event["details"], dict):
                    event["details"].pop("polyline", None)

        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error retrieving itinerary: {str(e)}"

async def delete_itinerary(trip_name: str, tool_context: InvocationContext) -> str:
    """
    Deletes a specific itinerary for a given user from MongoDB Atlas by trip name.
    """
    logger.info(f"Tool invoked: delete_itinerary for trip_name '{trip_name}'")
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        user_id = tool_context.session.user_id
        db = destinations_collection.database
        result = await db["itineraries"].delete_one({"user_id": user_id, "trip_name": trip_name})
        
        if result.deleted_count == 0:
            return f"No itinerary found with name '{trip_name}' for user '{user_id}'."
            
        return f"SUCCESS: Itinerary '{trip_name}' has been deleted."
    except Exception as e:
        return f"Error deleting itinerary: {str(e)}"

async def update_itinerary_status(trip_name: str, status: str, tool_context: InvocationContext) -> str:
    """
    Updates the status of a specific itinerary (e.g., from 'draft' to 'final').
    """
    logger.info(f"Tool invoked: update_itinerary_status to '{status}' for trip_name '{trip_name}'")
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        user_id = tool_context.session.user_id
        if status not in ["draft", "final"]:
            return f"Error: Invalid status '{status}'. Must be 'draft' or 'final'."

        db = destinations_collection.database
        result = await db["itineraries"].update_one(
            {"user_id": user_id, "trip_name": trip_name},
            {"$set": {
                "status": status, 
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            return f"No itinerary found with name '{trip_name}' for user '{user_id}'."
            
        return f"SUCCESS: Itinerary '{trip_name}' status updated to '{status}'."
    except Exception as e:
        return f"Error updating itinerary status: {str(e)}"

async def clone_itinerary(source_trip_name: str, new_trip_name: str, tool_context: InvocationContext) -> str:
    """
    Creates a new draft itinerary by cloning an existing one.
    Useful for exploring variations of a trip while keeping the original plan intact.
    """
    logger.info(f"Tool invoked: clone_itinerary from '{source_trip_name}' to '{new_trip_name}'")
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        user_id = tool_context.session.user_id
        db = destinations_collection.database
        source_doc = await db["itineraries"].find_one({"user_id": user_id, "trip_name": source_trip_name})
        
        if not source_doc:
            return f"Error: Source itinerary '{source_trip_name}' not found for user '{user_id}'."

        # Prevent overwriting an existing trip with the same new name
        if await db["itineraries"].find_one({"user_id": user_id, "trip_name": new_trip_name}):
            return f"Error: An itinerary named '{new_trip_name}' already exists for this user."

        # Strip the MongoDB ID and validate into the model
        source_doc.pop("_id", None)
        itinerary = Itinerary.model_validate(source_doc)
        
        # Update identifying details
        itinerary.trip_name = new_trip_name
        itinerary.status = "draft"
        # Note: metadata is no longer in ItineraryModel
        
        db["itineraries"].insert_one(itinerary.model_dump())
        return f"SUCCESS: Itinerary '{source_trip_name}' cloned to '{new_trip_name}' as a draft."
    except Exception as e:
        return f"Error cloning itinerary: {str(e)}"

async def list_trip_versions(source_trip_name: str, tool_context: InvocationContext) -> str:
    """
    Retrieves all draft versions cloned from a specific itinerary.
    """
    logger.info(f"Tool invoked: list_trip_versions for source_trip_name '{source_trip_name}'")
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        user_id = tool_context.session.user_id
        db = destinations_collection.database
        query = {
            "user_id": user_id,
            "status": "draft",
            "metadata.cloned_from": source_trip_name
        }

        results = await db["itineraries"].find(query).to_list(length=None)
        if not results:
            return f"No draft versions found cloned from '{source_trip_name}' for user '{user_id}'."

        # Strip massive polyline strings to save tokens and prevent agent context overflow
        for res in results:
            for event in res.get("events", []):
                if isinstance(event, dict) and "details" in event and isinstance(event["details"], dict):
                    event["details"].pop("polyline", None)

        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error listing trip versions: {str(e)}"

async def finalize_itinerary(trip_name: str, tool_context: InvocationContext) -> str:
    """
    Finalizes the trip by updating its status to 'final' and ensuring the latest 
    state from the agent's memory is persisted to MongoDB.
    """
    logger.info(f"Tool invoked: finalize_itinerary for trip_name '{trip_name}'")
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        db = destinations_collection.database
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        session_id = tool_context.session.id
        user_id = tool_context.session.user_id
        state = tool_context.state
        
        # 1. Search for the itinerary in agent memory
        # Architect agent uses 'final_itinerary', general tools might use 'active_itinerary'
        raw_itinerary = state.get("final_itinerary") or state.get("active_itinerary")
        
        # If the data in memory matches the requested trip_name, use it for persistence
        if isinstance(raw_itinerary, dict) and raw_itinerary.get("trip_name") == trip_name:
            # Validate/Hydrate into the Pydantic model for schema consistency
            itinerary = Itinerary.model_validate(raw_itinerary)
            
            itinerary.user_id = user_id # Ensure ownership
            
            itinerary_data = itinerary.model_dump()
            itinerary_data["session_id"] = session_id
            itinerary_data.pop("_id", None)
            
            # Upsert into MongoDB to ensure latest edits are captured
            await db["itineraries"].update_one(
                {"session_id": session_id},
                {"$set": itinerary_data},
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
        result = await db["itineraries"].update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "final",
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            return f"Error: No saved itinerary found with name '{trip_name}' to finalize."
            
        return f"SUCCESS: Saved itinerary '{trip_name}' marked as final in the database."
        
    except Exception as e:
        return f"Error finalizing itinerary: {str(e)}"
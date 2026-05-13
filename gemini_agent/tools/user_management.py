import json
import logging
from typing import Any
from gemini_agent.clients import destinations_collection
from gemini_agent.logic.models import TravelerProfile

logger = logging.getLogger(__name__)

def record_user_profile(profile: TravelerProfile, tool_context: Any) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Enforces Couple-First Pricing Logic and updates the profile in DB.
    """
    # 1. Enforce Couple Assumption Logic
    if profile.party_size == 2:
        profile.preferences.group_planning_per_person = False
        profile.room_sharing = True
        profile.people_per_room = 2
        if "romantic" not in profile.interests: # Check if 'romantic' is already there
            profile.interests.append("romantic")

    # 3. Persistence: Save embedded into the Itinerary document
    session_id = tool_context.session.id
    user_id = tool_context.session.user_id
    try:
        db = destinations_collection.database
        db["itineraries"].update_one(
            {"session_id": session_id, "user_id": user_id},
            {"$set": {"traveler_profile": profile.model_dump()}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to persist traveler profile to DB: {e}")

    tool_context.state.update({"traveler_profile": profile.model_dump()})
    return "User profile recorded successfully. Transitioning to Architect mode."

def query_user_profile(tool_context: Any) -> str:
    """
    Retrieves the current traveler profile for this active itinerary session.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        user_id = tool_context.session.user_id
        session_id = tool_context.session.id
        db = destinations_collection.database
        itinerary = db["itineraries"].find_one({"session_id": session_id, "user_id": user_id})
        if not itinerary or "traveler_profile" not in itinerary:
            return "No traveler profile found for this itinerary yet."
        return json.dumps(itinerary["traveler_profile"], default=str)
    except Exception as e:
        return f"Error retrieving profile: {str(e)}"
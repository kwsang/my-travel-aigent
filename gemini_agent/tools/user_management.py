import json
import logging
from typing import Any
from gemini_agent.clients import destinations_collection
from gemini_agent.logic.models import UserProfile

logger = logging.getLogger(__name__)

def record_user_profile(profile: UserProfile, tool_context: Any) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Enforces Couple-First Pricing Logic and updates the profile in DB.
    """
    # Enforce user_id from the session context to prevent AI hallucination
    profile.user_id = tool_context.session.user_id

    # 1. Enforce Couple Assumption Logic
    if profile.party_size == 2:
        profile.preferences.group_planning_per_person = False
        profile.room_sharing = True
        profile.people_per_room = 2
        if "romantic" not in profile.interests: # Check if 'romantic' is already there
            profile.interests.append("romantic")

    # 3. Persistence: Save to MongoDB for future session re-hydration
    try:
        db = destinations_collection.database
        db["user_profiles"].update_one(
            {"user_id": profile.user_id},
            {"$set": profile.model_dump()},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to persist user profile to DB: {e}")

    tool_context.state.update({"user_profile_data": profile.model_dump()})
    return "User profile recorded successfully. Transitioning to Architect mode."

def query_user_profile(tool_context: Any) -> str:
    """
    Retrieves a user's persistent travel profile and preferences from MongoDB.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        user_id = tool_context.session.user_id
        db = destinations_collection.database
        profile = db["user_profiles"].find_one({"user_id": user_id})
        if not profile:
            return f"No profile found for user '{user_id}'."
        return json.dumps(profile, default=str)
    except Exception as e:
        return f"Error retrieving profile: {str(e)}"
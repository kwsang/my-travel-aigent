import json
import logging
from typing import Any
import datetime
from gemini_agent.clients import destinations_collection
from gemini_agent.logic.models import TravelerProfile
from gemini_agent.logic.utils import get_state_context
from google.adk.agents.invocation_context import InvocationContext

logger = logging.getLogger(__name__)

async def record_user_profile(
    party_size: int,
    budget_limit: float,
    target_duration_days: int,
    tool_context: InvocationContext,
    starting_location: str = None,
    start_date: str = None,
    end_date: str = None,
    budget_currency: str = "USD",
    risk_tolerance: str = "relaxed",
    circadian_preference: str = "night_owl",
    activity_density: str = "medium",
    group_planning_per_person: bool = False,
    transport_preference: str = "public",
    personal_transport_available: bool = False,
    room_sharing: bool = False,
    people_per_room: int = 2,
    interests: list[str] = None,
) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Enforces Couple-First Pricing Logic and updates the profile in DB.
    """
    if not tool_context: return "Error: tool_context is missing."

    # Normalize hallucinated transport preferences back to strict types
    if transport_preference in ["car", "personal"]:
        if personal_transport_available:
            transport_preference = "public" # Ignored by the Pioneer if personal transport is available
        else:
            transport_preference = "rental"

    # Merge with existing profile to prevent agent from wiping out fields it didn't update
    _, existing_profile = get_state_context(tool_context)
    existing_prefs = existing_profile.get("preferences", {})

    profile_dict = {
        "party_size": party_size,
        "budget": {"total_limit": budget_limit, "currency": budget_currency},
        "room_sharing": room_sharing,
        "people_per_room": people_per_room,
        "interests": interests if interests else existing_profile.get("interests", []),
        "preferences": {
            "risk_tolerance": risk_tolerance,
            "circadian_preference": circadian_preference,
            "activity_density": activity_density,
            "group_planning_per_person": group_planning_per_person,
            "transport_preference": transport_preference,
            "personal_transport_available": personal_transport_available,
            "starting_location": starting_location if starting_location else existing_prefs.get("starting_location"),
            "start_date": start_date if start_date else existing_prefs.get("start_date"),
            "end_date": end_date if end_date else existing_prefs.get("end_date"),
            "target_duration_days": target_duration_days
        }
    }

    try:
        profile_model = TravelerProfile.model_validate(profile_dict)
    except Exception as e:
        logger.error(f"CRITICAL: Validation error while saving traveler profile: {str(e)}")
        return f"Error saving traveler profile: {str(e)}"
    # 1. Enforce Couple Assumption Logic
    if profile_model.party_size == 2:
        profile_model.preferences.group_planning_per_person = False
        profile_model.room_sharing = True
        profile_model.people_per_room = 2
        if "romantic" not in profile_model.interests: # Check if 'romantic' is already there
            profile_model.interests.append("romantic")

    # 3. Persistence: Save embedded into the Itinerary document
    session_id = tool_context.session.id
    user_id = tool_context.session.user_id
    try:
        db = destinations_collection.database
        await db["itineraries"].update_one(
            {"session_id": session_id, "user_id": user_id},
            {"$set": {"traveler_profile": profile_model.model_dump()}},
            upsert=True
        )
        
        # Phase 3: Update global users collection for long-term memory across sessions
        await db["users"].update_one(
            {"user_id": user_id},
            {"$set": {"preferences": profile_model.model_dump(), "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to persist traveler profile to DB: {e}")

    tool_context.state.update({"traveler_profile": profile_model.model_dump()})
    return "User profile recorded successfully. Transitioning to Architect mode."

async def query_user_profile(tool_context: InvocationContext) -> str:
    """
    Retrieves the current traveler profile for this active itinerary session.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        if not tool_context: return "Error: tool_context is missing."
        user_id = tool_context.session.user_id
        session_id = tool_context.session.id
        db = destinations_collection.database
        
        # Phase 3: Fetch long-term memory first
        user_doc = await db["users"].find_one({"user_id": user_id})
        if user_doc and "preferences" in user_doc:
            # Hydrate session state with remembered preferences
            tool_context.state.update({"traveler_profile": user_doc["preferences"]})
            return json.dumps(user_doc["preferences"], default=str)
            
        itinerary = await db["itineraries"].find_one({"session_id": session_id, "user_id": user_id})
        if not itinerary or "traveler_profile" not in itinerary:
            return "No traveler profile found for this itinerary yet."
        return json.dumps(itinerary["traveler_profile"], default=str)
    except Exception as e:
        return f"Error retrieving profile: {str(e)}"
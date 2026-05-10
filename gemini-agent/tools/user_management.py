import json
from typing import Any
from ..clients import destinations_collection
from .models import UserProfile

def record_user_profile(profile: UserProfile, tool_context: Any) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Enforces Couple-First Pricing Logic and strict schema adherence.
    """
    prefs = profile.preferences
    total_people = prefs.party_size.adults + prefs.party_size.children

    # 1. Enforce Couple Assumption Logic
    if total_people == 2:
        if prefs.group_planning_per_person is None:
            prefs.group_planning_per_person = False
        if prefs.room_sharing is None:
            prefs.room_sharing = True
        if prefs.people_per_room is None:
            prefs.people_per_room = 2
        
        if not any("romantic" in s.lower() for s in prefs.travel_style):
            prefs.travel_style.append("romantic")

    # 2. General Fallbacks
    if prefs.group_planning_per_person is None:
        prefs.group_planning_per_person = True
    if prefs.room_sharing is None:
        prefs.room_sharing = False
    if prefs.people_per_room is None:
        prefs.people_per_room = 1

    tool_context.state.update({"user_profile_data": profile.model_dump()})
    return "User profile recorded successfully. Transitioning to Architect mode."

def query_user_profile(user_id: str, tool_context: Any) -> str:
    """
    Retrieves a user's persistent travel profile and preferences from MongoDB.
    """
    try:
        if destinations_collection is None:
            return "Error: Database connection is currently unavailable."
            
        db = destinations_collection.database
        profile = db["user_profiles"].find_one({"user_id": user_id})
        if not profile:
            return f"No profile found for user '{user_id}'."
        return json.dumps(profile, default=str)
    except Exception as e:
        return f"Error retrieving profile: {str(e)}"
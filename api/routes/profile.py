import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Body, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from api.dependencies import get_db
from gemini_agent.logic.models import (
    ProfileUpdateRequest,
    TravelerProfile,
    UserProfilePreferences,
    TripBudget
)
from api.utils import flatten_for_mongo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("/{user_id}", response_model=TravelerProfile)
async def get_user_profile(user_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Retrieve the global user profile and preferences."""
    profile = await db.user_profiles.find_one({"user_id": user_id})
    if not profile:
        # Return default skeleton if no profile exists yet
        return TravelerProfile(
            preferences=UserProfilePreferences(),
            budget=TripBudget()
        )
    
    profile["_id"] = str(profile["_id"])
    return profile

@router.post("/{user_id}", response_model=TravelerProfile)
async def update_user_profile(
    user_id: str,
    profile_data: ProfileUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Persist or update user preferences and constraints."""
    logger.info(f"Updating profile for user: {user_id}")
    update_dict = profile_data.model_dump(exclude_unset=True)

    def extract_loc(d: dict):
        """Extracts and normalizes location data from various possible UI payload keys."""
        for key in ["starting_location", "start_location", "startingLocation", "startLocation", "location", "origin"]:
            if key in d:
                val = d.pop(key)
                if isinstance(val, dict):
                    return val.get("name") or val.get("description") or val.get("address") or str(val)
                elif val:
                    return str(val)
        return None

    loc = extract_loc(update_dict)
    if not loc and "preferences" in update_dict and isinstance(update_dict["preferences"], dict):
        loc = extract_loc(update_dict["preferences"])
              
    if loc:
        update_dict.setdefault("preferences", {})["starting_location"] = loc

    logger.info(f"Normalized Profile update payload for {user_id}: {update_dict}")

    # Perform a read-modify-write to safely merge nested objects
    existing_profile_doc = await db.user_profiles.find_one({"user_id": user_id})

    if existing_profile_doc:
        merged_data = {**existing_profile_doc, **update_dict}
        
        # Deep merge preferences
        if "preferences" in update_dict and isinstance(update_dict["preferences"], dict):
            existing_prefs = existing_profile_doc.get("preferences") or {}
            merged_prefs = {**existing_prefs, **update_dict["preferences"]}
            
            # Prevent starting_location from being explicitly set to None if we already have one
            if update_dict["preferences"].get("starting_location") is None and existing_prefs.get("starting_location") is not None:
                merged_prefs["starting_location"] = existing_prefs["starting_location"]
                
            merged_data["preferences"] = merged_prefs
            
        # Deep merge budget
        if "budget" in update_dict and isinstance(update_dict["budget"], dict):
            existing_budget = existing_profile_doc.get("budget") or {}
            merged_data["budget"] = {**existing_budget, **update_dict["budget"]}

        validated_model = TravelerProfile.model_validate(merged_data)
        final_update_data = validated_model.model_dump(by_alias=True)
    else:
        # If no profile exists, just validate the incoming data as a new one
        final_update_data = TravelerProfile.model_validate(update_dict).model_dump(by_alias=True)

    final_update_data["updated_at"] = datetime.now(timezone.utc)

    await db.user_profiles.update_one(
        {"user_id": user_id},
        {"$set": final_update_data},
        upsert=True
    )
    
    # Retrieve and return the updated profile
    updated_profile = await db.user_profiles.find_one({"user_id": user_id})
    if not updated_profile:
        raise HTTPException(status_code=404, detail="User profile not found after update.")
        
    updated_profile["_id"] = str(updated_profile["_id"])
    return updated_profile

@router.delete("/{user_id}")
async def delete_user_profile(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete a user's global profile and preferences."""
    logger.info(f"Deleting profile for user: {user_id}")
    try:
        result = await db.user_profiles.delete_one({"user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="User profile not found.")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting profile {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during deletion.")
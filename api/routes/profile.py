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
    await db.user_profiles.update_one(
        {"user_id": user_id},
        {"$set": {**update_dict, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    # Retrieve and return the updated profile
    updated_profile = await db.user_profiles.find_one({"user_id": user_id})
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
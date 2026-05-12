import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Body
from motor.motor_asyncio import AsyncIOMotorDatabase
from api.dependencies import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("/{user_id}")
async def get_user_profile(user_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Retrieve the global user profile and preferences."""
    profile = await db.user_profiles.find_one({"user_id": user_id})
    if not profile:
        # Return default skeleton if no profile exists yet
        return {
            "user_id": user_id,
            "party_size": 1,
            "budget": {"total_limit": 0, "currency": "USD"},
            "preferences": {
                "risk_tolerance": "relaxed",
                "circadian_preference": "night_owl"
            },
            "room_sharing": False,
            "people_per_room": 2
        }
    
    profile["_id"] = str(profile["_id"])
    return profile

@router.post("/{user_id}")
async def update_user_profile(
    user_id: str,
    profile_data: dict = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Persist or update user preferences and constraints."""
    logger.info(f"Updating profile for user: {user_id}")
    await db.user_profiles.update_one(
        {"user_id": user_id},
        {"$set": {**profile_data, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    return {"status": "success"}
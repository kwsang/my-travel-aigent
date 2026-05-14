import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from api.dependencies import get_current_user, get_db, get_session_db
from gemini_agent.logic.models import Itinerary, ItineraryPatchRequest
from gemini_agent.logic.validate_buffers import (
    validate_itinerary_structure, 
    validate_itinerary_budget
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/itinerary", tags=["itinerary"])

@router.get("/", response_model=list[Itinerary])
async def list_itineraries(
    user_id: str | None = None,
    auth_user_id: str | None = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """List recent itineraries for a specific identity."""
    identity = auth_user_id or user_id
    if not identity:
        return []

    # Find itineraries owned by this identity
    cursor = db.itineraries.find({"user_id": identity}).sort("updated_at", -1).limit(20)
    
    docs = await cursor.to_list(length=20)
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        doc["duration_days"] = doc.get("duration_days") or 0
        doc["party_size_total"] = doc.get("party_size_total") or 1
        doc["status"] = doc.get("status", "draft")
        doc["destination"] = doc.get("destination")
        doc.setdefault("is_conflict", False)
        doc.setdefault("validation_errors", [])
    return docs

@router.get("/{session_id}", response_model=Itinerary)
async def get_itinerary(
    session_id: str,
    user_id: str | None = None,
    auth_user_id: str | None = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Retrieve the structured itinerary JSON for a dashboard."""
    identity = auth_user_id or user_id or session_id
    try:
        itinerary_doc = await db.itineraries.find_one(
            {"session_id": session_id, "user_id": identity},
            sort=[("_id", -1)]
        )

        if not itinerary_doc:
            # Resilience: If no materialized doc exists, return an empty skeleton.
            # This prevents 404s on the frontend before the agent has created a plan.
            return {
                "session_id": session_id,
                "user_id": identity,
                "events": [],
                "trip_name": "New Trip",
                "destination": None,
                "duration_days": 0,
                "party_size_total": 1,
                "status": "draft",
                "is_conflict": False,
                "validation_errors": [],
                "user_profile_data": None,
                "updated_at": datetime.now(timezone.utc)
            }

        user_profile = await db.user_profiles.find_one({"user_id": itinerary_doc["user_id"]})
        
        is_conflict = False
        all_errors = []

        if user_profile:
            prefs = user_profile.get("preferences", {})
            risk = prefs.get("risk_tolerance", "relaxed")
            vibe = prefs.get("circadian_preference", "night_owl")
            
            struct_errors = validate_itinerary_structure(itinerary_doc, risk, vibe, user_profile)
            _, budget_errors = validate_itinerary_budget(itinerary_doc, user_profile)
            
            all_errors = struct_errors + budget_errors
            is_conflict = len(all_errors) > 0

        # Sanitize User Profile for JSON serialization
        if user_profile:
            user_profile["_id"] = str(user_profile["_id"])

        itinerary_doc.setdefault("duration_days", 0)
        itinerary_doc.setdefault("party_size_total", user_profile.get("party_size", 1) if user_profile else 1)
        itinerary_doc.setdefault("destination", None)
        itinerary_doc["_id"] = str(itinerary_doc["_id"])
        itinerary_doc["is_conflict"] = is_conflict
        itinerary_doc["validation_errors"] = all_errors
        itinerary_doc["user_profile_data"] = user_profile
        
        return itinerary_doc

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.patch("/{session_id}", response_model=Itinerary)
async def update_itinerary(
    session_id: str, 
    updates: ItineraryPatchRequest,
    user_id: str | None = None,
    auth_user_id: str | None = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Apply manual updates to an itinerary and re-validate."""
    identity = auth_user_id or user_id or session_id
    logger.info(f"PATCH Itinerary Request: session={session_id}, user={identity}")
    try:
        itinerary_doc = await db.itineraries.find_one({"session_id": session_id, "user_id": identity})
        
        # If the doc doesn't exist (e.g., renaming a brand new trip), create a skeleton
        if not itinerary_doc:
            logger.debug(f"Itinerary {session_id} not found in DB. Initializing skeleton for update.")
            itinerary_doc = {
                "session_id": session_id,
                "user_id": identity,
                "events": [],
                "trip_name": "New Trip",
                "destination": None,
                "duration_days": 0,
                "party_size_total": 1,
                "status": "draft",
            }

        user_profile = await db.user_profiles.find_one({"user_id": identity})
        # Fallback profile for validation if the user hasn't chatted yet
        profile_for_val = user_profile or {
            "preferences": {}, 
            "party_size": 1, 
            "room_sharing": False, 
            "people_per_room": 2
        }

        # Extract updates from the request body
        update_data = updates.model_dump(exclude_unset=True)
        update_time = datetime.now(timezone.utc)
        update_data["updated_at"] = update_time
        logger.debug(f"Updates to apply: {list(update_data.keys())}")

        # Prepare the full itinerary object for validation
        itinerary = {**itinerary_doc, **update_data}

        prefs = profile_for_val.get("preferences", {})
        risk = prefs.get("risk_tolerance", "relaxed")
        vibe = prefs.get("circadian_preference", "night_owl")

        logger.info(f"Running structural validation for {session_id} (Risk: {risk})")
        struct_errors = validate_itinerary_structure(itinerary, risk, vibe, profile_for_val)
        _, budget_errors = validate_itinerary_budget(itinerary, profile_for_val)

        all_errors = struct_errors + budget_errors
        is_conflict = len(all_errors) > 0
        logger.debug(f"Validation complete. Conflicts: {is_conflict}, Errors: {len(all_errors)}")

        await db.itineraries.update_one(
            {"session_id": session_id, "user_id": identity},
            {"$set": {**update_data, "session_id": session_id, "user_id": identity}},
            upsert=True
        )

        # Sanitize User Profile for JSON serialization
        if user_profile:
            user_profile["_id"] = str(user_profile["_id"])

        itinerary_doc.update(update_data)

        # Explicit assignment to ensure these fields exist and are valid for Itinerary
        itinerary_doc["duration_days"] = itinerary_doc.get("duration_days") or 0
        itinerary_doc["party_size_total"] = itinerary_doc.get("party_size_total") or profile_for_val.get("party_size", 1)
        itinerary_doc["destination"] = itinerary_doc.get("destination")
        itinerary_doc["status"] = itinerary_doc.get("status", "draft")
        itinerary_doc["is_conflict"] = bool(is_conflict)
        itinerary_doc["validation_errors"] = all_errors or []
        itinerary_doc["updated_at"] = update_time
        itinerary_doc["user_profile_data"] = user_profile
        itinerary_doc["_id"] = str(itinerary_doc.get("_id", "new"))

        return itinerary_doc

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"CRITICAL: Unhandled exception in PATCH /itinerary/{session_id}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.delete("/{session_id}")
async def delete_itinerary_route(
    session_id: str,
    user_id: str | None = None,
    auth_user_id: str | None = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
    session_db: AsyncIOMotorDatabase = Depends(get_session_db)
):
    """Delete a specific itinerary and its associated agent chat history."""
    identity = auth_user_id or user_id or session_id
    try:
        # Clear materialized data
        await db.itineraries.delete_one({"session_id": session_id, "user_id": identity})
        # Clear agent memory
        await session_db.sessions.delete_one({"session_id": session_id, "user_id": identity})
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting itinerary {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during deletion.")
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from api.dependencies import get_current_user, get_db
from gemini_agent.logic.models import ItineraryModel, ItineraryPatchRequest
from gemini_agent.logic.validate_buffers import (
    validate_itinerary_structure, 
    validate_itinerary_budget
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/itinerary", tags=["itinerary"])

@router.get("/{session_id}", response_model=ItineraryModel)
async def get_itinerary(
    session_id: str,
    user_id: str | None = None,
    auth_user_id: str | None = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Retrieve the structured itinerary JSON for a dashboard."""
    identity = auth_user_id or user_id or f"anon_{session_id}"
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
                "duration_days": 0,
                "party_size_total": 1,
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

        itinerary_doc.setdefault("duration_days", 0)
        itinerary_doc.setdefault("party_size_total", user_profile.get("party_size", 1) if user_profile else 1)
        itinerary_doc["_id"] = str(itinerary_doc["_id"])
        itinerary_doc["is_conflict"] = is_conflict
        itinerary_doc["validation_errors"] = all_errors
        itinerary_doc["user_profile_data"] = user_profile
        
        return itinerary_doc

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.patch("/{session_id}", response_model=ItineraryModel)
async def update_itinerary(
    session_id: str, 
    updates: ItineraryPatchRequest,
    auth_user_id: str | None = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Apply manual updates to an itinerary and re-validate."""
    user_id = auth_user_id or f"anon_{session_id}"
    try:
        itinerary_doc = await db.itineraries.find_one({"session_id": session_id, "user_id": user_id})
        if not itinerary_doc:
            raise HTTPException(status_code=404, detail="Itinerary doc not found")

        user_profile = await db.user_profiles.find_one({"user_id": user_id})
        if not user_profile:
            raise HTTPException(status_code=404, detail="User profile not found")

        proposed_events = [event.model_dump() for event in updates.events]
        itinerary = {**itinerary_doc, "events": proposed_events}

        prefs = user_profile.get("preferences", {})
        risk = prefs.get("risk_tolerance", "relaxed")
        vibe = prefs.get("circadian_preference", "night_owl")

        struct_errors = validate_itinerary_structure(itinerary, risk, vibe, user_profile)
        _, budget_errors = validate_itinerary_budget(itinerary, user_profile)

        all_errors = struct_errors + budget_errors
        is_conflict = len(all_errors) > 0
        update_time = datetime.now(timezone.utc)

        await db.itineraries.update_one(
            {"session_id": session_id},
            {"$set": {"events": proposed_events, "updated_at": update_time}}
        )

        itinerary_doc.setdefault("duration_days", 0)
        itinerary_doc.setdefault("party_size_total", user_profile.get("party_size", 1) if user_profile else 1)
        itinerary_doc["events"] = proposed_events
        itinerary_doc["is_conflict"] = is_conflict
        itinerary_doc["validation_errors"] = all_errors
        itinerary_doc["updated_at"] = update_time
        itinerary_doc["user_profile_data"] = user_profile
        itinerary_doc["_id"] = str(itinerary_doc["_id"])

        return itinerary_doc

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
import os
from datetime import datetime, timezone
from typing import Any
from fastapi import FastAPI, HTTPException, Body
from motor.motor_asyncio import AsyncIOMotorClient

from gemini_agent.logic.validate_buffers import validate_itinerary_structure, validate_itinerary_budget
from gemini_agent.logic.models import ItineraryPatchRequest, ValidationResponse, ItineraryModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="My Travel Aigent API", version="1.0.0")

# MongoDB Setup
MONGODB_URI = os.getenv("MONGODB_URI")
client = AsyncIOMotorClient(MONGODB_URI)
# Assumes the database name matches your implementation plan
db = client["my-travel-aigent"]

@app.get("/itinerary/{session_id}", response_model=ItineraryModel)
async def get_itinerary(session_id: str):
    """
    Endpoint for the Visual Dashboard to retrieve the structured itinerary JSON.
    Queries the 'Itineraries' collection for the matching session_id.
    """
    try:
        # Retrieve the latest draft for the given session
        itinerary = await db.Itineraries.find_one(
            {"session_id": session_id},
            sort=[("_id", -1)] # Get the most recent update
        )

        if not itinerary:
            raise HTTPException(
                status_code=404, 
                detail=f"Itinerary for session '{session_id}' not found."
            )

        # Clean up the MongoDB internal _id for JSON response compatibility
        itinerary["_id"] = str(itinerary["_id"])
        return itinerary

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.patch("/itinerary/{session_id}", response_model=ValidationResponse)
async def update_itinerary(session_id: str, updates: ItineraryPatchRequest):
    """
    Direct manipulation endpoint. Re-validates the entire itinerary structure
    and budget buffers after a user modification (like drag-and-drop).
    """
    try:
        # 1. Fetch current itinerary and associated user profile
        itinerary_doc = await db.Itineraries.find_one({"session_id": session_id})
        if not itinerary_doc:
            raise HTTPException(status_code=404, detail="Itinerary doc not found")

        user_profile = await db.UserProfiles.find_one({"user_id": itinerary_doc["user_id"]})
        if not user_profile:
            raise HTTPException(status_code=404, detail="User profile not found")

        # 2. Convert Pydantic models back to dict for the validation logic
        # This allows us to use Phase 4 logic without refactoring it entirely yet
        proposed_events = [event.model_dump() for event in updates.events]
        itinerary = {**itinerary_doc, "events": proposed_events}

        # 3. Re-validate using Phase 4 logic
        risk = user_profile.get("risk_tolerance", "relaxed")
        vibe = user_profile.get("circadian_preference", "night_owl")

        struct_errors = validate_itinerary_structure(itinerary, risk, vibe, user_profile)
        budget_ok, budget_errors = validate_itinerary_budget(itinerary, user_profile)

        all_errors = struct_errors + budget_errors

        # 4. Persistence: Update MongoDB if there are no blocking errors
        # We still save even with warnings/errors but return them to the UI for display
        await db.Itineraries.update_one(
            {"session_id": session_id},
            {"$set": {"events": proposed_events, "updated_at": datetime.now(timezone.utc)}}
        )

        return {
            "status": "success" if not all_errors else "warning",
            "validation_errors": all_errors,
            "itinerary_id": str(itinerary_doc["_id"])
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
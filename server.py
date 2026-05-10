import os
import datetime
from typing import Any
from fastapi import FastAPI, HTTPException, Body
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from gemini_agent.logic.validate_buffers import validate_itinerary_structure, validate_itinerary_budget

load_dotenv()

app = FastAPI(title="My Travel Aigent API Bridge")

# MongoDB Setup
MONGODB_URI = os.getenv("MONGODB_URI")
client = AsyncIOMotorClient(MONGODB_URI)
# Assumes the database name matches your implementation plan
db = client["my-travel-aigent"]

@app.get("/itinerary/{session_id}")
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

@app.patch("/itinerary/{session_id}")
async def update_itinerary(session_id: str, updates: dict = Body(...)):
    """
    Direct manipulation endpoint. Re-validates the entire itinerary structure
    and budget buffers after a user modification (like drag-and-drop).
    """
    try:
        # 1. Fetch current itinerary and associated user profile
        itinerary = await db.Itineraries.find_one({"session_id": session_id})
        if not itinerary:
            raise HTTPException(status_code=404, detail="Itinerary not found")

        user_profile = await db.UserProfiles.find_one({"user_id": itinerary["user_id"]})
        if not user_profile:
            raise HTTPException(status_code=404, detail="User profile not found")

        # 2. Apply proposed updates (e.g., modified events list)
        if "events" in updates:
            itinerary["events"] = updates["events"]

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
            {"$set": {"events": itinerary["events"], "updated_at": datetime.datetime.utcnow()}}
        )

        return {
            "status": "success" if not all_errors else "warning",
            "validation_errors": all_errors,
            "itinerary_id": str(itinerary["_id"])
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
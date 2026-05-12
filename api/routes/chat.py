import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from google.genai import types
from google.adk.runners import Runner
from motor.motor_asyncio import AsyncIOMotorDatabase

from api.dependencies import get_current_user, get_runner, get_db
from gemini_agent.logic.models import ChatRequest, ChatResponse
from gemini_agent.logic.validate_buffers import (
    validate_itinerary_structure, 
    validate_itinerary_budget
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    auth_user_id: str | None = Depends(get_current_user),
    runner: Runner = Depends(get_runner),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Main entry point for the agent conversation.
    Orchestrates the ADK Runner to process user input and return the agent's response.
    """
    user_id = auth_user_id or request.user_id or request.session_id
    logger.info(f"User: {user_id} | Session: {request.session_id} | Message: {request.message[:50]}...")

    try:
        # 1. Process Message via Runner
        agent_text = ""
        async for event in runner.run_async(
            user_id=user_id,
            session_id=request.session_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part(text=request.message)]
            )
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text and not getattr(part, "thought", False):
                        agent_text += part.text

        # 2. Retrieve the updated session state to check for conflicts
        session = await runner.session_service.get_session(
            app_name="my_travel_aigent",
            user_id=user_id, 
            session_id=request.session_id
        )
        
        is_conflict = False
        if session:
            state = getattr(session, "state", {})
            itinerary = state.get("final_itinerary")
            user_profile = state.get("user_profile_data")
            
            # Defensive string parsing
            if isinstance(itinerary, str):
                try: itinerary = json.loads(itinerary)
                except: pass
            if isinstance(user_profile, str):
                try: user_profile = json.loads(user_profile)
                except: pass
             # Sync the extracted state to the materialized collections
            # This ensures the visual dashboard can find the latest plans
            if isinstance(itinerary, dict):
                # Extract party size: try itinerary first, then profile, then default 1
                party_size = itinerary.get("party_size_total")
                if party_size is None and isinstance(user_profile, dict):
                    party_size = user_profile.get("party_size")

                await db.itineraries.update_one(
                    {"session_id": request.session_id, "user_id": user_id},
                    {"$set": {
                        "session_id": request.session_id,
                        "user_id": user_id,
                        "events": itinerary.get("events", []),
                        "trip_name": itinerary.get("trip_name", "Your Trip"),
                        "duration_days": itinerary.get("duration_days", 0),
                        "party_size_total": party_size or 1,
                        "status": itinerary.get("status", "draft"),
                        "updated_at": datetime.now(timezone.utc)
                    }},
                    upsert=True
                )

            if isinstance(user_profile, dict):
                await db.user_profiles.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        **user_profile, 
                        "updated_at": datetime.now(timezone.utc)
                    }},
                    upsert=True
                )

            if isinstance(itinerary, dict) and isinstance(user_profile, dict):
                prefs = user_profile.get("preferences", {})
                if isinstance(prefs, str):
                    try: prefs = json.loads(prefs)
                    except: prefs = {}

                risk = prefs.get("risk_tolerance", "relaxed")
                vibe = prefs.get("circadian_preference", "night_owl")
                
                # Re-run validation logic
                struct_errors = validate_itinerary_structure(itinerary, risk, vibe, user_profile)
                _, budget_errors = validate_itinerary_budget(itinerary, user_profile)
                
                if struct_errors or budget_errors:
                    logger.warning(f"Conflicts detected: {len(struct_errors)} structural, {len(budget_errors)} budget")
                    is_conflict = True

        return ChatResponse(response=agent_text, is_conflict=is_conflict)

    except Exception as e:
        logger.exception("CRITICAL: Error in /chat endpoint")
        raise HTTPException(status_code=500, detail=f"Agent execution error: {str(e)}")

@router.get("/chat/{session_id}")
async def get_chat_history(
    session_id: str,
    user_id: str | None = None,
    runner: Runner = Depends(get_runner)
):
    """Retrieve conversation history for a specific session."""
    try:
        identity = user_id or session_id
        session = await runner.session_service.get_session(
            app_name="my_travel_aigent",
            user_id=identity,
            session_id=session_id
        )
        
        if not session or not session.events:
            return {"history": []}

        history = []
        for event in session.events:
            if event.content and event.content.parts:
                role = "user" if event.content.role == "user" else "agent"
                text = "".join([p.text for p in event.content.parts if p.text])
                if text:
                    history.append({"role": role, "content": text})
        
        return {"history": history}
    except Exception as e:
        logger.error(f"Error fetching chat history for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Database connection error occurred while fetching history.")
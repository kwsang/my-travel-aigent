import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from google.genai import types
from google.adk.runners import Runner
from motor.motor_asyncio import AsyncIOMotorDatabase

from api.dependencies import get_current_user, get_runner, get_db, get_session_db
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
    db: AsyncIOMotorDatabase = Depends(get_db),
    session_db: AsyncIOMotorDatabase = Depends(get_session_db)
):
    """
    Main entry point for the agent conversation.
    Orchestrates the ADK Runner to process user input and return the agent's response.
    """
    user_id = auth_user_id or request.user_id or request.session_id
    logger.info(f"User: {user_id} | Session: {request.session_id} | Message: {request.message}")

    # LOGGING: Verify incoming state
    logger.info(f"[CHAT STATE VERIFICATION] Incoming Destination: {request.itinerary.get('destination') if request.itinerary else 'None'}")

    try:
        # Fetch latest materialized DB state to prevent stale React closures from wiping data
        latest_itin = await db.itineraries.find_one({"session_id": request.session_id, "user_id": user_id}) or {}
        
        if request.itinerary is not None:
            if not request.itinerary.get("destination") and latest_itin.get("destination"):
                request.itinerary["destination"] = latest_itin["destination"]
                logger.info(f"Fixed Stale Request: Injected Destination '{latest_itin['destination']}' from DB.")
            if not request.itinerary.get("trip_name") and latest_itin.get("trip_name"):
                request.itinerary["trip_name"] = latest_itin["trip_name"]

        # Pre-inject UI state directly into the agent's memory collection before running
        if request.traveler_profile is not None or request.itinerary is not None:
            session = await runner.session_service.get_session(app_name="my_travel_aigent", user_id=user_id, session_id=request.session_id)
            if not session:
                session = await runner.session_service.create_session(app_name="my_travel_aigent", user_id=user_id, session_id=request.session_id)
            
            if session.state is None:
                session.state = {}
                
            update_state = {}
                
            if request.traveler_profile is not None:
                session.state["traveler_profile"] = request.traveler_profile
                update_state["data.state.traveler_profile"] = request.traveler_profile
                prefs = request.traveler_profile.get("preferences") or {}
                logger.info(f"Injected Profile Constraints - Start: {prefs.get('start_date')}, End: {prefs.get('end_date')}, Days: {prefs.get('target_duration_days')}")

            if request.itinerary is not None:
                session.state["final_itinerary"] = request.itinerary
                update_state["data.state.final_itinerary"] = request.itinerary
                
                itinerary_update = dict(request.itinerary)
                itinerary_update.pop("_id", None)
                itinerary_update["session_id"] = request.session_id
                itinerary_update["user_id"] = user_id
                itinerary_update["updated_at"] = datetime.now(timezone.utc)
                await db.itineraries.update_one(
                    {"session_id": request.session_id, "user_id": user_id},
                    {"$set": itinerary_update},
                    upsert=True
                )
                
            # Mutating `session.state` updates the in-memory reference used by the Runner.
            # We also persist it directly to MongoDB to ensure it isn't lost if the server restarts.
            await session_db.sessions.update_one(
                {"session_id": request.session_id, "user_id": user_id, "app_name": "my_travel_aigent"},
                {
                    "$set": update_state,
                    "$setOnInsert": {"data.events": []}
                },
                upsert=True
            )

        agent_error = None
        try:
            # 1. Process Message via Runner
            async for event in runner.run_async(
                user_id=user_id,
                session_id=request.session_id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part(text=request.message)]
                )
            ):
                # Deep tracing for agent operations
                if getattr(event, "content", None) and getattr(event.content, "parts", None):
                    for part in event.content.parts:
                        if getattr(part, "function_call", None):
                            fc = part.function_call
                            logger.info(f"🛠️ [ADK TOOL CALL] {fc.name} - Args: {dict(fc.args) if hasattr(fc, 'args') else {}}")
                        elif getattr(part, "text", None) and part.text.strip():
                            logger.info(f"💬 [ADK TEXT] {part.text.strip()}")

        except Exception as e:
            logger.exception("CRITICAL: Error in agent runner task")
            agent_error = e

        # 2. Retrieve the updated session state to extract the final response and check conflicts
        session = await runner.session_service.get_session(
            app_name="my_travel_aigent",
            user_id=user_id, 
            session_id=request.session_id
        )
        
        # Extract the most recent agent message directly from the persisted session history
        agent_text = ""
        if session and getattr(session, "events", []):
            for event in reversed(session.events):
                content = getattr(event, "content", None)
                if content and getattr(content, "role", "") != "user":
                    parts = getattr(content, "parts", None) or []
                    texts = [getattr(p, "text", "") for p in parts if getattr(p, "text", "")]
                    if texts:
                        agent_text = "".join(texts)
                        break

        # Fallback if the agent executed a tool but didn't generate conversational text
        if agent_error:
            agent_text = "I hit an unexpected snag while planning (likely a network timeout or token limit), but I safely saved my progress up to this point! Just tell me to 'continue' and I'll pick up exactly where I left off."
        elif not agent_text.strip():
            agent_text = "I have updated your itinerary based on your request! What would you like to adjust next?"

        logger.info(f"Agent response for session {request.session_id}: {agent_text}")

        is_conflict = False
        itinerary = None
        user_profile = None
        
        if session:
            state = getattr(session, "state", None) or {}
            
            itinerary = state.get("final_itinerary")
            if isinstance(itinerary, str):
                try: itinerary = json.loads(itinerary)
                except: pass
                
            if not itinerary:
                itinerary_doc = await db.itineraries.find_one({"session_id": request.session_id, "user_id": user_id})
                if itinerary_doc:
                    itinerary_doc.pop("_id", None)
                    itinerary = itinerary_doc

            user_profile = state.get("traveler_profile") or state.get("user_profile_data")
            
            # Defensive string parsing
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
                        "destination": itinerary.get("destination"),
                        "lodging": itinerary.get("lodging"),
                        "duration_days": itinerary.get("duration_days", 0),
                        "party_size_total": party_size or 1,
                        "status": itinerary.get("status", "draft"),
                        "traveler_profile": user_profile,
                        "updated_at": datetime.now(timezone.utc)
                    }},
                    upsert=True
                )

            if isinstance(user_profile, dict):
                user_profile_update = dict(user_profile)
                user_profile_update.pop("_id", None)
                await db.user_profiles.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        **user_profile_update, 
                        "updated_at": datetime.now(timezone.utc)
                    }},
                    upsert=True
                )

        if isinstance(itinerary, dict):
            itinerary["is_conflict"] = False
            itinerary["validation_errors"] = []
            
            if isinstance(user_profile, dict) and itinerary.get("events"):
                prefs = user_profile.get("preferences") or {}
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
                    itinerary["is_conflict"] = True
                    itinerary["validation_errors"] = struct_errors + budget_errors

        return ChatResponse(
            response=agent_text,
            is_conflict=is_conflict,
            itinerary=itinerary if isinstance(itinerary, dict) else None,
            traveler_profile=user_profile if isinstance(user_profile, dict) else None
        )

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
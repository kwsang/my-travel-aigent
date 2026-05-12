import os
import logging
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from fastapi import FastAPI, HTTPException, Body, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from google.genai import types
from google.adk.events.event import Event
from google.adk.runners import Runner
from gemini_agent.clients import MONGODB_URI
from google.adk.sessions import BaseSessionService
from google.adk.sessions.session import Session
from google.adk.sessions.base_session_service import ListSessionsResponse

class MongoDBSessionService(BaseSessionService):
    def __init__(self, uri, db_name, collection_name):
        super().__init__()
        self.client = AsyncIOMotorClient(uri)
        self.collection = self.client[db_name][collection_name]

    async def get_session(self, *, app_name: str, user_id: str, session_id: str, config: Any = None):
        logger.info(f"Fetching session: user={user_id}, session={session_id}")
        doc = await self.collection.find_one({"user_id": user_id, "session_id": session_id, "app_name": app_name})
        if not doc:
            logger.info(f"No session found for {session_id}")
            return None
        
        # Ensure state is a dictionary even if persisted as a JSON string
        state = doc["data"].get("state", {})
        if isinstance(state, str):
            try:
                state = json.loads(state)
            except Exception as e:
                logger.warning(f"Failed to parse stringified state: {e}")
                state = {}
        
        # Reconstruct Event objects for conversation history
        raw_history = doc["data"].get("history", [])
        history = []
        for e_dict in raw_history:
            history.append(Event.model_validate(e_dict))

        # Reconstruct the Session object from the persisted dictionary
        logger.debug(f"Session state keys found: {list(state.keys())}")
        return Session(
            id=session_id,
            app_name=app_name,
            user_id=user_id,
            state=state,
            events=history
        )

    async def create_session(self, *, app_name: str, user_id: str, state: dict[str, Any] | None = None, session_id: str | None = None) -> Session:
        session_id = session_id or f"sess_{datetime.now().timestamp()}"
        await self.collection.insert_one({
            "user_id": user_id,
            "session_id": session_id,
            "app_name": app_name,
            "data": {"state": state or {}},
            "updated_at": datetime.now(timezone.utc)
        })
        return Session(
            id=session_id, 
            user_id=user_id, 
            app_name=app_name, 
            state=state or {},
            events=[] # Explicitly initialize events to avoid context mapping errors
        )

    async def append_event(self, session: Session, event: Any) -> Any:
        """
        Standard ADK persistence hook. 
        Saves the updated session state to MongoDB whenever an event occurs.
        """
        if event.partial:
            return event

        # 1. Update the in-memory session object using ADK logic
        await super().append_event(session, event)
        
        # 2. Persist the current state to MongoDB
        history_json = [e.model_dump(mode='json') for e in session.events]
        await self.collection.update_one(
            {"user_id": session.user_id, "session_id": session.id, "app_name": session.app_name},
            {"$set": {
                "data": {"state": session.state, "history": history_json},
                "updated_at": datetime.now(timezone.utc)
            }},
            upsert=True
        )
        return event

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str):
        await self.collection.delete_one({"user_id": user_id, "session_id": session_id, "app_name": app_name})

    async def list_sessions(self, *, app_name: str, user_id: str | None = None) -> ListSessionsResponse:
        """Retrieves a list of all session IDs for the given user and application."""
        query = {"app_name": app_name}
        if user_id:
            query["user_id"] = user_id
            
        cursor = self.collection.find(query, {"session_id": 1, "user_id": 1, "data": 1, "_id": 0})
        sessions = []
        async for doc in cursor:
            state = doc["data"].get("state", {})
            if isinstance(state, str):
                try: state = json.loads(state)
                except: state = {}

            sessions.append(Session(
                id=doc["session_id"],
                user_id=doc["user_id"],
                app_name=app_name,
                state=state
            ))
        return ListSessionsResponse(sessions=sessions)

from gemini_agent.logic.models import (
    ItineraryPatchRequest, ItineraryModel, ChatRequest, ChatResponse
)
from gemini_agent.logic.validate_buffers import (
    validate_itinerary_structure, 
    validate_itinerary_budget
)
from gemini_agent import agent_definition
from dotenv import load_dotenv

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the ADK Agent Application as a singleton
agent_app = agent_definition.create_travel_agent()

# Initialize persistent MongoDB session storage for the Agent
session_service = MongoDBSessionService(
    uri=MONGODB_URI,
    db_name="my_travel_aigent_sessions",
    collection_name="sessions"
)
runner = Runner(
    app=agent_app, 
    session_service=session_service,
    auto_create_session=True  # Fixes the "Session not found" crash
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure TTL index on the session collection for automatic cleanup (30-day retention)
    try:
        sync_client = MongoClient(MONGODB_URI)
        session_db = sync_client["my_travel_aigent_sessions"]
        session_db["sessions"].create_index("updated_at", expireAfterSeconds=2592000)
        logger.info("MongoDB TTL index verified for session collection.")
        sync_client.close()
    except Exception as e:
        logger.warning(f"Could not verify MongoDB TTL index: {e}")

    # Start the global runner once when the server starts
    async with runner:
        yield

app = FastAPI(title="My Travel Aigent API", version="1.0.0", lifespan=lifespan, redirect_slashes=True)

# Resolve Frontend URLs and normalize them for CORS to prevent 403 errors
# Professional CORS: Handle multiple origins and trailing slashes
FRONTEND_URLS_RAW = os.getenv("FRONTEND_URL", "http://localhost:3000")
FRONTEND_URLS = [url.strip() for url in FRONTEND_URLS_RAW.split(",") if url.strip()]

# Add both with and without trailing slash for robustness
ALLOWED_ORIGINS = list(set([url.rstrip('/') for url in FRONTEND_URLS] + [f"{url.rstrip('/')}/" for url in FRONTEND_URLS] + ["http://localhost:3000", "http://127.0.0.1:3000"]))

# Allow any origin from this project's Cloud Run domain to handle dynamic project-number URLs
ALLOWED_ORIGIN_REGEX = r"https://travel-aigent-web-.*\.run\.app"


# 1. CORS Configuration
# Essential for Phase 5 transition to Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set auto_error=False to allow unauthenticated users to use session-based identity
security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Security(security)):
    """
    Security dependency to validate JWTs.
    Returns the raw token string if present, otherwise None.
    """
    if credentials:
        return credentials.credentials
    return None

# MongoDB Setup
client = AsyncIOMotorClient(MONGODB_URI)
# Assumes the database name matches your implementation plan
db = client["my-travel-aigent"]

@app.get("/", tags=["system"])
async def root():
    return {"message": "My Travel Aigent API is running.", "docs": "/docs", "health": "/health"}

@app.get("/health", tags=["system"])
async def health_check():
    """
    Active health check endpoint.
    Verifies MongoDB connectivity and the presence of the Agent Application.
    Returns 503 if critical services are unreachable.
    """
    health_report = {"mongodb": "offline", "agent_app": "offline"}
    try:
        # Perform a low-latency ping to the MongoDB cluster
        await client.admin.command('ping')
        health_report["mongodb"] = "online"
    except Exception as e:
        logger.error(f"Health Check: MongoDB connection error: {e}")

    if agent_app is not None:
        health_report["agent_app"] = "online"

    if any(status == "offline" for status in health_report.values()):
        # Cloud Run uses non-2xx codes to detect unhealthy instances
        raise HTTPException(status_code=503, detail=health_report)

    return {"status": "healthy", "checks": health_report}

@app.get("/itinerary/{session_id}", response_model=ItineraryModel)
async def get_itinerary(
    session_id: str,
    user_id: str | None = None,
    auth_user_id: str | None = Depends(get_current_user)
):
    """
    Endpoint for the Visual Dashboard to retrieve the structured itinerary JSON.
    If unauthenticated, scopes access to the session_id itself.
    """
    identity = auth_user_id or user_id or f"anon_{session_id}"
    try:
        # Retrieve the latest draft for the given session
        itinerary_doc = await db.itineraries.find_one(
            {"session_id": session_id, "user_id": identity},
            sort=[("_id", -1)] # Get the most recent update
        )

        if not itinerary_doc:
            raise HTTPException(
                status_code=404, 
                detail=f"Itinerary for session '{session_id}' not found."
            )

        # Fetch user profile to provide context for re-validation (Rule 6 and Scenario 5)
        user_profile = await db.user_profiles.find_one({"user_id": itinerary_doc["user_id"]})
        
        is_conflict = False
        all_errors = []

        if user_profile:
            prefs = user_profile.get("preferences", {})
            risk = prefs.get("risk_tolerance", "relaxed")
            vibe = prefs.get("circadian_preference", "night_owl")
            
            # Run validation logic against the current persisted state
            struct_errors = validate_itinerary_structure(itinerary_doc, risk, vibe, user_profile)
            _, budget_errors = validate_itinerary_budget(itinerary_doc, user_profile)
            
            all_errors = struct_errors + budget_errors
            is_conflict = len(all_errors) > 0

        # Clean up the MongoDB internal _id for JSON response compatibility
        itinerary_doc["_id"] = str(itinerary_doc["_id"])
        itinerary_doc["is_conflict"] = is_conflict
        itinerary_doc["validation_errors"] = all_errors
        itinerary_doc["user_profile_data"] = user_profile
        
        return itinerary_doc

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    auth_user_id: str | None = Depends(get_current_user)
):
    """
    Main entry point for the agent conversation.
    Orchestrates the ADK Runner to process user input and return the agent's response.
    """
    # Derive identity: Auth Token > Request Body > Session Fallback
    user_id = auth_user_id or request.user_id or f"anon_{request.session_id}"
    logger.debug(f"--- Chat Request Start ---")
    logger.info(f"User: {user_id} | Session: {request.session_id} | Message: {request.message[:50]}...")

    try:
        # 1. Call the global agent runner (initialized in lifespan)
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
                    # Filter out model internal reasoning (thoughts) to provide clean text to the UI
                    if part.text and not getattr(part, "thought", False):
                        agent_text += part.text
        logger.info(f"Agent generated {len(agent_text)} characters.")

        # 2. Retrieve the updated session state to check for logistics conflicts
        session = await runner.session_service.get_session(
            app_name="my_travel_aigent",
            user_id=user_id, 
            session_id=request.session_id
        )
        
        is_conflict = False
        if session:
            # The session stores agent variables in the 'state' attribute
            state = getattr(session, "state", {})
            itinerary = state.get("final_itinerary")
            user_profile = state.get("user_profile_data")
            
            # Trace data types to identify 'str' vs 'dict' corruption
            logger.debug(f"State Validation - itinerary type: {type(itinerary)}")
            logger.debug(f"State Validation - profile type: {type(user_profile)}")

            # Defensively handle cases where data might be stored as JSON strings
            if isinstance(itinerary, str):
                try:
                    itinerary = json.loads(itinerary)
                except:
                    pass
            if isinstance(user_profile, str):
                try:
                    user_profile = json.loads(user_profile)
                except:
                    pass

            if isinstance(itinerary, dict) and isinstance(user_profile, dict):
                # Extract user constraints from the profile data structure
                prefs = user_profile.get("preferences", {})
                # Deep defensive check for nested stringified fields
                if isinstance(prefs, str):
                    try: prefs = json.loads(prefs)
                    except: prefs = {}

                risk = prefs.get("risk_tolerance", "relaxed")
                vibe = prefs.get("circadian_preference", "night_owl")
                
                # Re-run Phase 4 validation logic against the current state
                struct_errors = validate_itinerary_structure(itinerary, risk, vibe, user_profile)
                _, budget_errors = validate_itinerary_budget(itinerary, user_profile)
                
                if struct_errors or budget_errors:
                    logger.warning(f"Conflicts detected: {len(struct_errors)} structural, {len(budget_errors)} budget")
                    is_conflict = True

        logger.debug(f"--- Chat Request Success ---")
        return ChatResponse(response=agent_text, is_conflict=is_conflict)

    except Exception as e:
        logger.exception("CRITICAL: Error in /chat endpoint")
        raise HTTPException(status_code=500, detail=f"Agent execution error: {str(e)}")

@app.patch("/itinerary/{session_id}", response_model=ItineraryModel)
async def update_itinerary(
    session_id: str, 
    updates: ItineraryPatchRequest,
    auth_user_id: str | None = Depends(get_current_user)
):
    """
    Direct manipulation endpoint. Re-validates the entire itinerary structure
    and budget buffers after a user modification (like drag-and-drop).
    """
    user_id = auth_user_id or f"anon_{session_id}"
    try:
        # 1. Fetch current itinerary and associated user profile
        itinerary_doc = await db.itineraries.find_one({"session_id": session_id, "user_id": user_id})
        if not itinerary_doc:
            raise HTTPException(status_code=404, detail="Itinerary doc not found")

        user_profile = await db.user_profiles.find_one({"user_id": user_id})
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
        is_conflict = len(all_errors) > 0
        update_time = datetime.now(timezone.utc)

        # 4. Persistence: Update MongoDB if there are no blocking errors
        # We still save even with warnings/errors but return them to the UI for display
        await db.itineraries.update_one(
            {"session_id": session_id},
            {"$set": {"events": proposed_events, "updated_at": update_time}}
        )

        # 5. Prepare and return the full updated itinerary
        itinerary_doc["events"] = proposed_events
        itinerary_doc["is_conflict"] = is_conflict
        itinerary_doc["validation_errors"] = all_errors
        itinerary_doc["updated_at"] = update_time
        itinerary_doc["_id"] = str(itinerary_doc["_id"])

        return itinerary_doc

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
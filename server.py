import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from fastapi import FastAPI, HTTPException, Body, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from google.adk.runners import Runner
from google.adk.sessions import SessionService

class MongoDBSessionService(SessionService):
    def __init__(self, uri, db_name, collection_name):
        self.client = AsyncIOMotorClient(uri)
        self.collection = self.client[db_name][collection_name]

    async def get_session(self, user_id: str, session_id: str, app_name: str):
        doc = await self.collection.find_one({"user_id": user_id, "session_id": session_id, "app_name": app_name})
        return doc["data"] if doc else None

    async def create_session(self, user_id: str, session_id: str, app_name: str):
        await self.collection.insert_one({
            "user_id": user_id,
            "session_id": session_id,
            "app_name": app_name,
            "data": {},
            "updated_at": datetime.now(timezone.utc)
        })

    async def update_session(self, user_id: str, session_id: str, app_name: str, session):
        await self.collection.update_one(
            {"user_id": user_id, "session_id": session_id, "app_name": app_name},
            {"$set": {"data": session, "updated_at": datetime.now(timezone.utc)}},
            upsert=True
        )

    async def delete_session(self, user_id: str, session_id: str, app_name: str):
        await self.collection.delete_one({"user_id": user_id, "session_id": session_id, "app_name": app_name})

from gemini_agent.logic.validate_buffers import validate_itinerary_structure, validate_itinerary_budget
from gemini_agent.logic.models import ItineraryPatchRequest, ValidationResponse, ItineraryModel, ChatRequest, ChatResponse
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
    uri=os.getenv("MONGODB_URI"),
    db_name="my_travel_aigent_sessions",
    collection_name="sessions"
)
runner = Runner(app=agent_app, session_service=session_service)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure TTL index on the session collection for automatic cleanup (30-day retention)
    try:
        client = MongoClient(os.getenv("MONGODB_URI"))
        session_db = client["my_travel_aigent_sessions"]
        session_db["sessions"].create_index("updated_at", expireAfterSeconds=2592000)
        logger.info("MongoDB TTL index verified for session collection.")
        client.close()
    except Exception as e:
        logger.warning(f"Could not verify MongoDB TTL index: {e}")

    # Start the global runner once when the server starts
    async with runner:
        yield

app = FastAPI(title="My Travel Aigent API", version="1.0.0", lifespan=lifespan)

# 1. CORS Configuration
# Essential for Phase 5 transition to Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Security dependency to validate JWTs.
    In production, you would decode the token using a library like 'python-jose'
    and verify it against your auth provider (e.g., Google or NextAuth secret).
    """
    token = credentials.credentials
    # Example logic:
    # if not verify_token(token):
    #     raise HTTPException(status_code=401, detail="Invalid token")
    # return decoded_user_id
    return "test_user_savannah"  # Placeholder return

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

@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Main entry point for the agent conversation.
    Orchestrates the ADK Runner to process user input and return the agent's response.
    """
    try:
        # 1. Call the global agent runner (initialized in lifespan)
        response = await runner.call_agent_async(
            app_name="my_travel_aigent",
            input_text=request.message,
            user_id=user_id,
            session_id=request.session_id
        )

        # 2. Retrieve the updated session state to check for logistics conflicts
        session = await runner.session_service.get_session(user_id, request.session_id, "my_travel_aigent")
        
        is_conflict = False
        if session:
            # The session stores agent variables in the 'state' attribute/key
            state = session.state if hasattr(session, "state") else session.get("state", {})
            itinerary = state.get("final_itinerary")
            user_profile = state.get("user_profile_data")
            
            if itinerary and user_profile:
                # Extract user constraints from the profile data structure
                prefs = user_profile.get("preferences", {})
                risk = prefs.get("risk_tolerance", "relaxed")
                vibe = prefs.get("circadian_preference", "night_owl")
                
                # Re-run Phase 4 validation logic against the current state
                struct_errors = validate_itinerary_structure(itinerary, risk, vibe, user_profile)
                _, budget_errors = validate_itinerary_budget(itinerary, user_profile)
                
                if struct_errors or budget_errors:
                    is_conflict = True

        return ChatResponse(response=response.text, is_conflict=is_conflict)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent execution error: {str(e)}")

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
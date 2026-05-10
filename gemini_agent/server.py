import os
import logging
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Any
from google.genai import types as genai_types
from google.adk.runners import Runner
from adk_mongodb_session.mongodb.sessions import MongodbSessionService
from pymongo import MongoClient
from google.adk.errors.already_exists_error import AlreadyExistsError
from dotenv import load_dotenv
import agent_definition

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Shared app instance
travel_agent_app = agent_definition.create_travel_agent()

# Initialize persistent MongoDB session storage
session_service = MongodbSessionService(
    mongodb_uri=os.getenv("MONGODB_URI"),
    db_name="my_travel_aigent_sessions"
)
runner = Runner(app=travel_agent_app, session_service=session_service)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure TTL index on the session collection for automatic cleanup
    try:
        # Using a temporary client to manage indexes on the session database
        client = MongoClient(os.getenv("MONGODB_URI"))
        session_db = client["my_travel_aigent_sessions"]
        
        # expireAfterSeconds: 2592000 seconds = 30 days
        # This will automatically delete sessions that haven't been updated in 30 days.
        session_db["sessions"].create_index("updated_at", expireAfterSeconds=2592000)
        logger.info("MongoDB TTL index verified for session collection (30-day retention).")
        client.close()
    except Exception as e:
        logger.warning(f"Could not verify MongoDB TTL index: {e}")

    # This starts the global runner once when the server starts
    async with runner:
        yield

app = FastAPI(title="My Travel Aigent - Brain API", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    state_delta: Optional[dict[str, Any]] = None

class ChatResponse(BaseModel):
    text: Optional[str] = None
    thought: Optional[str] = None
    role: str = "model"
    is_conflict: bool = False

@app.get("/health")
async def health():
    """Simple endpoint to verify the API is reachable."""
    return {"status": "healthy", "frontend_url": frontend_url}

@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Exposes the Gemini ADK agent via a REST endpoint for the Phase 5 Dashboard.
    """
    logger.info(f"Received chat request for user: {request.user_id}")
    
    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        logger.error("Missing Google Cloud credentials. Agent cannot run.")
        raise HTTPException(status_code=500, detail="Cloud credentials not configured.")

    async def event_generator():
        # UPSERT LOGIC: Only create the session if it doesn't already exist.
        # This allows the global runner to maintain context across multiple chat turns.
        # Context Re-hydration: If the runner is missing the profile, load it from MongoDB
        try:
            await runner.session_service.create_session(
                app_name="my_travel_aigent",
                user_id=request.user_id,
                session_id=request.session_id
            )
            # If create_session succeeds, it's a new session for this runner instance.
            # Attempt to re-hydrate from the persistent store (MongoDB).
            from clients import db as mongodb
            if mongodb is not None:
                persistent_profile = mongodb["user_profiles"].find_one({"user_id": request.user_id})
                if persistent_profile:
                    logger.info(f"Re-hydrating context for user: {request.user_id}")
                    persistent_profile.pop("_id", None)
                    if request.state_delta is None:
                        request.state_delta = {}
                    request.state_delta["user_profile_data"] = persistent_profile
                
                # Itinerary Re-hydration: Load the most recent draft to allow seamless resumption
                latest_itinerary = mongodb["itineraries"].find_one(
                    {"user_id": request.user_id, "status": "draft"},
                    sort=[("metadata.created_at", -1)]
                )
                if latest_itinerary:
                    logger.info(f"Re-hydrating latest draft itinerary for user: {request.user_id}")
                    latest_itinerary.pop("_id", None)
                    if request.state_delta is None:
                        request.state_delta = {}
                    request.state_delta["active_itinerary"] = latest_itinerary

                # UI Conflict Alert: Detect mismatches during re-hydration to signal the frontend
                profile_data = request.state_delta.get("user_profile_data", {})
                active_itinerary = request.state_delta.get("active_itinerary", {})
                p_start = profile_data.get("preferences", {}).get("starting_location")
                i_start = active_itinerary.get("metadata", {}).get("starting_location")

                if p_start and i_start and p_start != i_start:
                    conflict_msg = ChatResponse(
                        text=f"**Starting Location Discrepancy**: This trip starts from **{i_start}**, which differs from your profile default (**{p_start}**).",
                        role="system",
                        is_conflict=True
                    )
                    yield json.dumps(conflict_msg.model_dump()) + "\n"

        except AlreadyExistsError:
            # Session already exists in the global runner, which is expected for multi-turn chat.
            pass

        message = genai_types.Content(
            role="user", 
            parts=[genai_types.Part(text=request.message)]
        )
        
        yielded_any = False
        try:
            async for event in runner.run_async(
                user_id=request.user_id,
                session_id=request.session_id,
                new_message=message,
                state_delta=request.state_delta or {}
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text or part.thought:
                            chunk = ChatResponse(text=part.text, thought=part.thought)
                            yield json.dumps(chunk.model_dump()) + "\n"
                            yielded_any = True
            if not yielded_any:
                yield json.dumps({"text": "The agent did not return a response.", "role": "model"}) + "\n"
        except Exception as e:
            logger.error(f"Error running agent: {str(e)}")
            yield json.dumps({"text": f"Error: {str(e)}", "role": "system"}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
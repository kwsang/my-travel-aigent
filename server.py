import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from google.adk.runners import Runner
from gemini_agent.clients import MONGODB_URI
from api.services.session_service import MongoDBSessionService
from api.routes import chat, itinerary

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
    # Initialize shared MongoDB database
    client = AsyncIOMotorClient(MONGODB_URI)
    app.state.db = client["my-travel-aigent"]
    # Initialize global runner
    app.state.runner = runner

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

# Include split routes
app.include_router(chat.router)
app.include_router(itinerary.router)

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
    db_client = getattr(app.state, "db", None)
    try:
        if db_client:
            await db_client.client.admin.command('ping')
        health_report["mongodb"] = "online"
    except Exception as e:
        logger.error(f"Health Check: MongoDB connection error: {e}")

    if agent_app is not None:
        health_report["agent_app"] = "online"

    if any(status == "offline" for status in health_report.values()):
        # Cloud Run uses non-2xx codes to detect unhealthy instances
        raise HTTPException(status_code=503, detail=health_report)

    return {"status": "healthy", "checks": health_report}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
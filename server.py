import os
import json
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from api import config
from api.services.runner_factory import create_agent_runner
from api.routes import chat, itinerary, profile, destinations
from dotenv import load_dotenv

from gemini_agent.tools.geo_tools import search_places
from gemini_agent.tools.discovery import save_destination_lodging, save_destination_activities

load_dotenv()

# Suppress ADK Experimental Feature Warnings
os.environ["ADK_SUPPRESS_EXPERIMENTAL_FEATURE_WARNINGS"] = "true"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d | %(name)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)

# Enable Debug logging to trace parallel tool execution in the terminal
logging.getLogger('google.adk').setLevel(logging.DEBUG)
logging.getLogger('httpx').setLevel(logging.DEBUG)

# Shared Agent Runner
runner = create_agent_runner()

async def precache_destinations_task(app: FastAPI):
    """Background task to autonomously fetch and cache hotels/activities for destinations."""
    logger.info("Background pre-caching task started.")
    while True:
        try:
            db = app.state.db
            if db is not None:
                # Find a destination missing lodging or activities
                dest = await db.destinations.find_one({
                    "$or": [
                        {"suggested_lodging": {"$exists": False}},
                        {"suggested_lodging": {"$size": 0}},
                        {"suggested_activities": {"$exists": False}},
                        {"suggested_activities": {"$size": 0}}
                    ]
                })

                if dest:
                    city = dest.get("name")
                    state = dest.get("state")
                    country = dest.get("country", "USA")
                    
                    location_parts = [p for p in [city, state, country] if p]
                    full_location = ", ".join(location_parts)
                    
                    logger.info(f"Autonomously pre-caching missing data for: {full_location}")

                    if not dest.get("suggested_lodging"):
                        hotels_json = await search_places(query=f"best hotels and resorts in {full_location}", location_type="lodging", tool_context=None)
                        if hotels_json and not hotels_json.startswith("Error"):
                            try:
                                await save_destination_lodging(full_location, json.loads(hotels_json)[:3], tool_context=None)
                            except json.JSONDecodeError:
                                logger.warning(f"Failed to parse hotels JSON for {full_location}")

                    if not dest.get("suggested_activities"):
                        activities_json = await search_places(query=f"top things to do and restaurants in {full_location}", tool_context=None)
                        if activities_json and not activities_json.startswith("Error"):
                            try:
                                await save_destination_activities(full_location, json.loads(activities_json)[:5], tool_context=None)
                            except json.JSONDecodeError:
                                logger.warning(f"Failed to parse activities JSON for {full_location}")
        except Exception as e:
            logger.error(f"Error in pre-caching task: {e}")
        
        # Wait 30 seconds between queries to stay well under rate limits and allow background processing
        await asyncio.sleep(30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Database
    client = AsyncIOMotorClient(config.MONGODB_URL)
    app.state.db = client[config.DATABASE_NAME]
    app.state.session_db = client[config.SESSION_DATABASE_NAME]
    app.state.runner = runner

    # Ensure TTL index for automatic cleanup
    try:
        # Use the internal runner's collection to create the index via Motor
        collection = runner.session_service.collection
        await collection.create_index("updated_at", expireAfterSeconds=config.SESSION_TTL_SECONDS)
        logger.info("MongoDB TTL index verified.")
    except Exception as e:
        logger.warning(f"Could not verify MongoDB TTL index: {e}")

    # Start the background caching task
    cache_task = asyncio.create_task(precache_destinations_task(app))

    async with runner:
        yield
        
    cache_task.cancel()

app = FastAPI(
    title=config.APP_TITLE,
    version=config.APP_VERSION,
    lifespan=lifespan,
    redirect_slashes=True
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Standardizes HTTP error responses raised manually via 'raise HTTPException'."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "message": exc.detail,
                "code": exc.status_code,
                "path": request.url.path
            }
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global catch-all for unexpected server errors to ensure consistent JSON responses."""
    logger.exception(f"Unhandled exception at {request.url.path}: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "message": "Internal Server Error",
                "code": 500,
                "path": request.url.path
            }
        }
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_origin_regex=config.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include split routes
app.include_router(chat.router)
app.include_router(itinerary.router)
app.include_router(profile.router)
app.include_router(destinations.router)

@app.get("/", tags=["system"])
async def root(): #
    return {"message": "Travel AIgent API is running.", "docs": "/docs", "health": "/health"}

@app.get("/health", tags=["system"])
async def health_check():
    """
    Active health check endpoint.
    Verifies MongoDB connectivity and the presence of the Agent Application.
    Returns 503 if critical services are unreachable.
    """
    health_report = {"mongodb": "offline", "agent_app": "offline"}
    db_client = getattr(app.state, "db", None)
    runner_instance = getattr(app.state, "runner", None)
    try:
        if db_client:
            await db_client.client.admin.command('ping')
        health_report["mongodb"] = "online"
    except Exception as e:
        logger.error(f"Health Check: MongoDB connection error: {e}")

    if runner_instance and runner_instance.app:
        health_report["agent_app"] = "online"

    if any(status == "offline" for status in health_report.values()):
        # Cloud Run uses non-2xx codes to detect unhealthy instances
        raise HTTPException(status_code=503, detail=health_report)

    return {"status": "healthy", "checks": health_report}

@app.post("/webhook/atlas-trigger", tags=["system"])
async def atlas_trigger_webhook(request: Request):
    """
    Phase 5: Webhook target for MongoDB Atlas Database Triggers.
    Triggered asynchronously when an itinerary is updated.
    """
    payload = await request.json()
    full_doc = payload.get("fullDocument")
    if not full_doc:
        return JSONResponse(status_code=400, content={"error": "fullDocument missing from payload"})
        
    session_id = full_doc.get("session_id")
    user_id = full_doc.get("user_id")
    if not session_id or not user_id:
        return JSONResponse(status_code=400, content={"error": "Missing routing IDs"})
        
    from gemini_agent.tools.itinerary_tools import _simulate_background_validation
    # Run validation in the background
    await _simulate_background_validation(session_id, user_id, full_doc)
    
    return {"status": "success", "message": "Async validation complete"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
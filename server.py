import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from api import config
from api.services.runner_factory import create_agent_runner
from api.routes import chat, itinerary, profile, destinations
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Shared Agent Runner
runner = create_agent_runner()

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

    async with runner:
        yield

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
from fastapi import Request, Security, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from google.adk.runners import Runner

security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Security(security)):
    """Security dependency to validate JWTs."""
    if credentials:
        return credentials.credentials
    return None

def get_db(request: Request) -> AsyncIOMotorDatabase:
    """Retrieves the MongoDB database instance from app state."""
    if not hasattr(request.app.state, "db"):
        raise HTTPException(status_code=500, detail="Database not initialized")
    return request.app.state.db

def get_runner(request: Request) -> Runner:
    """Retrieves the ADK Runner instance from app state."""
    if not hasattr(request.app.state, "runner"):
        raise HTTPException(status_code=500, detail="Agent Runner not initialized")
    return request.app.state.runner
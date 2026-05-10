import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Any
from google.genai import types as genai_types
from google.adk.runners import InMemoryRunner
from dotenv import load_dotenv
import agent_definition

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="My Travel Aigent - Brain API")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared app instance
travel_agent_app = agent_definition.create_travel_agent()

class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    state_delta: Optional[dict[str, Any]] = None

class ChatResponse(BaseModel):
    text: Optional[str] = None
    thought: Optional[str] = None
    role: str = "model"

@app.get("/health")
async def health():
    """Simple endpoint to verify the API is reachable."""
    return {"status": "healthy", "frontend_url": frontend_url}

@app.post("/chat", response_model=List[ChatResponse])
async def chat(request: ChatRequest):
    """
    Exposes the Gemini ADK agent via a REST endpoint for the Phase 5 Dashboard.
    """
    logger.info(f"Received chat request for user: {request.user_id}")
    
    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        logger.error("Missing Google Cloud credentials. Agent cannot run.")
        raise HTTPException(status_code=500, detail="Cloud credentials not configured.")

    responses = []
    async with InMemoryRunner(app=travel_agent_app, app_name="my_travel_aigent") as runner:
        # UPSERT LOGIC: Ensure the session exists in this runner instance before execution
        await runner.session_service.create_session(
            app_name="my_travel_aigent",
            user_id=request.user_id,
            session_id=request.session_id
        )

        message = genai_types.Content(
            role="user", 
            parts=[genai_types.Part(text=request.message)]
        )
        
        try:
            async for event in runner.run_async(
                user_id=request.user_id,
                session_id=request.session_id,
                new_message=message,
                state_delta=request.state_delta or {}
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        # Collect text and thoughts (for UI debugging)
                        if part.text or part.thought:
                            responses.append(ChatResponse(text=part.text, thought=part.thought))
        except Exception as e:
            logger.error(f"Error running agent: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal Agent Error")
        
    if not responses:
        return [ChatResponse(text="The agent did not return a response.", role="model")]
        
    return responses 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
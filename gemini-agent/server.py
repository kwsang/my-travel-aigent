import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Any
from google.genai import types as genai_types
from google.adk.runners import InMemoryRunner
from .agent_definition import create_travel_agent

# Setup logging
logger = logging.getLogger(__name__)

app = FastAPI(title="My Travel Aigent - Brain API")

# Enable CORS for Next.js frontend development (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared app instance
travel_agent_app = create_travel_agent()

class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    state_delta: Optional[dict[str, Any]] = None

class ChatResponse(BaseModel):
    text: Optional[str] = None
    thought: Optional[str] = None
    role: str = "model"

@app.post("/chat", response_model=List[ChatResponse])
async def chat(request: ChatRequest):
    """
    Exposes the Gemini ADK agent via a REST endpoint for the Phase 5 Dashboard.
    """
    responses = []
    async with InMemoryRunner(app=travel_agent_app, app_name="my_travel_aigent") as runner:
        message = genai_types.Content(
            role="user", 
            parts=[genai_types.Part(text=request.message)]
        )
        
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
        
    return responses

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
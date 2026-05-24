import os
import sys
import datetime
import asyncio
import logging
from dotenv import load_dotenv

# Ensure the project root is in the python path to allow absolute imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from google.genai import types
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from gemini_agent import agent_definition
from gemini_agent.tools.phase1_state_tools import get_db

load_dotenv()
os.environ["ADK_SUPPRESS_EXPERIMENTAL_FEATURE_WARNINGS"] = "true"

logging.basicConfig(level=logging.INFO, format='%(message)s')
# Enable ADK Debug logging so we can see the exact tool calls being made in the console
logging.getLogger('google.adk').setLevel(logging.DEBUG)

async def test_agent_scratchpad_e2e():
    print("\n=== Test: Agent E2E Scratchpad Orchestration ===\n")
    
    # 1. Initialize the app and runner
    my_app = agent_definition.create_travel_agent()
    session_service = InMemorySessionService()
    runner = Runner(app=my_app, session_service=session_service, auto_create_session=True)
    
    user_id = "test_scratchpad_user"
    session_id = f"test_scratchpad_session_{int(datetime.datetime.now().timestamp())}"
    destination = "Chicago, IL"
    
    # 2. Pre-inject state to skip the Concierge intake process
    initial_state = {
        "traveler_profile": {
            "party_size": 2,
            "budget": {"total_limit": 5000, "currency": "USD"},
            "preferences": {"starting_location": "Boston, MA"}
        },
        "final_itinerary": {
            "destination": destination,
            "trip_name": "Windy City Weekend",
            "duration_days": 3,
            "events": [],
            "status": "draft"
        }
    }
    
    await session_service.create_session(
        app_name="my_travel_aigent", user_id=user_id, session_id=session_id, state=initial_state
    )
    
    # 3. Instruct the agent with a prompt that necessitates the scratchpad
    user_input = (
        f"Please find 10 highly-rated dinner restaurants in {destination}. "
        "Do NOT return the raw data directly to me yet. Instead, use your save_to_scratchpad tool "
        "to stash the search results into the database so we don't clog up our chat context. "
        "After successfully saving them, use the get_top_items_from_scratchpad tool to retrieve "
        "just the top 2 and recommend those to me."
    )
    
    print(f"User: {user_input}\n")
    
    # 4. Run the Agent
    async with runner:
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=user_input)])
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        print(part.text, end="", flush=True)
        print("\n")

if __name__ == "__main__":
    asyncio.run(test_agent_scratchpad_e2e())
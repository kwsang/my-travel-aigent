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
# Enable ADK Debug logging so we can see the exact tool calls
logging.getLogger('google.adk').setLevel(logging.DEBUG)

async def test_agent_geospatial_e2e():
    print("\n=== Test: Agent E2E Geospatial Caching ===\n")
    
    # 1. Initialize the app and runner
    my_app = agent_definition.create_travel_agent()
    session_service = InMemorySessionService()
    runner = Runner(app=my_app, session_service=session_service, auto_create_session=True)
    
    user_id = "test_geo_user"
    session_id = f"test_geo_session_{int(datetime.datetime.now().timestamp())}"
    
    # 2. Pre-inject state to drop us directly into the Architect agent
    initial_state = {
        "traveler_profile": {
            "party_size": 2,
            "budget": {"total_limit": 5000, "currency": "USD"},
            "preferences": {"starting_location": "New York, NY"}
        },
        "final_itinerary": {
            "destination": "San Francisco, CA",
            "trip_name": "Bay Area Weekend",
            "duration_days": 3,
            "events": [],
            "status": "draft"
        }
    }
    
    await session_service.create_session(
        app_name="my_travel_aigent", user_id=user_id, session_id=session_id, state=initial_state
    )
    
    # 3. Instruct the agent to cache and then query
    user_input = (
        "Please use your save_places_to_cache tool to save these three locations. "
        "Format each with a 'name' and a 'location' object containing 'lat' and 'lng'.\n"
        "1. Golden Gate Park: lat 37.7694, lng -122.4862\n"
        "2. Alcatraz: lat 37.8269, lng -122.4229\n"
        "3. Pier 39: lat 37.8086, lng -122.4098\n\n"
        "Once successfully cached, use your find_nearby_cached_places tool centered "
        "at lat 37.8000, lng -122.4100 with a radius_meters of 2000 to find out which "
        "ones are close by. Tell me the nearby results."
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

    # 5. Clean up test data
    print("\nCleaning up test data from MongoDB...")
    db = get_db()
    await db.places_cache.delete_many({"name": {"$in": ["Golden Gate Park", "Alcatraz", "Pier 39"]}})
    print("Test complete!")

if __name__ == "__main__":
    asyncio.run(test_agent_geospatial_e2e())
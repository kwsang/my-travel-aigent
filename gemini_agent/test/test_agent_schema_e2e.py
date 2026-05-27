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

async def test_agent_schema_e2e():
    print("\n=== Test: Agent E2E Schema-less Query ===\n")
    
    db = get_db()
    test_place_id = "ChIJ_fake_schema_e2e_789"
    
    print("Pre-populating MongoDB with a mock place containing nested raw_google_data...")
    await db.places_cache.update_one(
        {"place_id": test_place_id},
        {"$set": {
            "name": "The Grand Test Hotel",
            "raw_google_data": {
                "accessibilityOptions": {
                    "wheelchairAccessibleParking": True,
                    "wheelchairAccessibleEntrance": False
                }
            }
        }},
        upsert=True
    )

    # 1. Initialize the app and runner
    my_app = agent_definition.create_travel_agent()
    session_service = InMemorySessionService()
    runner = Runner(app=my_app, session_service=session_service, auto_create_session=True)
    
    user_id = "test_schema_user"
    session_id = f"test_schema_session_{int(datetime.datetime.now().timestamp())}"
    
    await session_service.create_session(
        app_name="my_travel_aigent", user_id=user_id, session_id=session_id, state={}
    )
    
    # 2. Instruct the agent to query the deeply nested data
    user_input = (
        f"I am looking at a hotel with the place_id '{test_place_id}'. "
        "Please use your query_raw_place_data tool to look up the "
        "'accessibilityOptions.wheelchairAccessibleParking' field for this place "
        "and tell me if it offers wheelchair accessible parking."
    )
    
    print(f"User: {user_input}\n")
    
    # 3. Run the Agent
    async with runner:
        print("\n--- Query 1: Existing Field ---")
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=user_input)])
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        print(part.text, end="", flush=True)
        print("\n")

        print("\n--- Query 2: Non-existent Field ---")
        user_input_2 = (
            f"Now use the query_raw_place_data tool to check if the hotel has a "
            "'helicopterPad' field and tell me the result."
        )
        print(f"User: {user_input_2}\n")
        
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=user_input_2)])
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        print(part.text, end="", flush=True)
        print("\n")

    # 4. Clean up test data
    print("\nCleaning up test data from MongoDB...")
    await db.places_cache.delete_one({"place_id": test_place_id})
    print("Test complete!")

if __name__ == "__main__":
    asyncio.run(test_agent_schema_e2e())
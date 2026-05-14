import os
import json
import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
import logging

# New ADK Imports
from google.genai import types
from google.adk.runners import Runner
from google.adk.agents.llm_agent import LlmAgent
from gemini_agent import agent_definition
from google.adk.sessions.in_memory_session_service import InMemorySessionService

# Absolute package import to avoid "not defined" NameErrors
from gemini_agent.logic.validate_buffers import calculate_buffer, validate_itinerary_structure, validate_itinerary_budget
from gemini_agent.test.test_maps_integration import get_real_traffic_duration
from gemini_agent.test.test_places_integration import find_place_id, validate_venue_availability

load_dotenv()

# Enable ADK Debug logging to see Agent Delegation and Tool Calls
logging.basicConfig(level=logging.INFO, format='%(name)s - %(message)s')
logging.getLogger('google.adk').setLevel(logging.DEBUG)

def get_schedule(date_str, time_str, duration_mins=None, tz_name="America/New_York"):
    """Helper to generate local and UTC timestamps for an event."""
    tz = ZoneInfo(tz_name)
    local_start = datetime.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=tz)
    res = {
        "local_start_time": local_start.strftime("%Y-%m-%dT%H:%M:%S"),
        "start_time_utc": local_start.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timezone": tz_name
    }
    if duration_mins:
        local_end = local_start + datetime.timedelta(minutes=duration_mins)
        res["local_end_time"] = local_end.strftime("%Y-%m-%dT%H:%M:%S")
        res["end_time_utc"] = local_end.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return res

def evaluate_transport_mode(distance_hours, arrival_time_str):
    """
    Implements Rule 6.1: Driving vs. Flying.
    Proposes driving if < 6 hours and arrival < 12:00 PM.
    """
    arrival_time = datetime.datetime.strptime(arrival_time_str, "%H:%M").time()
    cutoff_time = datetime.time(12, 0)
    
    if distance_hours < 6 and arrival_time <= cutoff_time:
        return "TRANSPORT (Driving)", "Maximize hotel value and save on airfare."
    return "FLIGHT", "Faster arrival for long-distance travel."

async def simulate_adk_agent_run(user_input: str):
    """
    True ADK Simulation: Tests the actual Agent orchestration instead of manual logic.
    """
    print("\n--- Starting ADK Agent Runner Simulation ---")
    # This assumes an 'architect' agent is defined in your package
    my_app = agent_definition.create_travel_agent()
    runner = Runner(app=my_app, session_service=InMemorySessionService(), auto_create_session=True)
    
    # Simulate the start of a session
    session_id = f"sim_{datetime.datetime.now().timestamp()}"
    
    full_text = ""
    async for event in runner.run_async(
        user_id="sim_user",
        session_id=session_id,
        new_message=types.Content(role="user", parts=[types.Part(text=user_input)])
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    full_text += part.text
    
    print(f"Agent Response: {full_text}")
    return full_text

async def run_full_agent_test():
    """
    End-to-End ADK Integration Test.
    Validates that the multi-agent orchestration (Supervisor -> Architect)
    produces a valid itinerary that passes structural and budget checks.
    """
    print("=== Phase 4: End-to-End ADK Integration Test ===\n")

    # 1. Setup the App and Runner
    my_app = agent_definition.create_travel_agent()
    # Runner requires a session service
    runner = Runner(app=my_app, session_service=InMemorySessionService(), auto_create_session=True)
    
    user_id = "test_user_savannah"
    session_id = f"test_session_{int(datetime.datetime.now().timestamp())}"
    
    # 2. Define the Mission
    user_input = (
        "Plan a 2-day trip to Savannah, GA for my partner and me. We are leaving from Duluth, GA. "
        "We are night owls and prefer a relaxed vibe. Our total budget is $2000. "
        "We'll be driving our own car. Please include a nice dinner at The Olde Pink House."
    )

    print(f"Sending Mission to Agent: {user_input}\n")
    
    # 3. Call Agent async
    async with runner:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=user_input)])
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        print(part.text, end="", flush=True)
        print("\n")
        
        # Extract State for Validation
        state = await runner.session_service.get_session(user_id, session_id, "my_travel_aigent")
        itinerary = state.state.get("final_itinerary")
        user_prefs = state.state.get("user_profile_data")

        if itinerary and user_prefs:
            print("\n--- Running Automated Validations on Agent Output ---")
            validate_itinerary_structure(itinerary, "relaxed", "night_owl", user_prefs)
            validate_itinerary_budget(itinerary, user_prefs)
        else:
            print("FAIL: Agent did not produce a final_itinerary in the session state.")

if __name__ == "__main__":
    import asyncio
    # Ensure API keys are present
    if not os.environ.get("GOOGLE_MAPS_API_KEY") or not os.environ.get("VOYAGE_API_KEY"):
        print("Please ensure GOOGLE_MAPS_API_KEY and VOYAGE_API_KEY are set in .env")
    else:
        asyncio.run(run_full_agent_test())
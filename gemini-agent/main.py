import os
import json
import asyncio
from google.genai import types as genai_types
from google.adk.runners import InMemoryRunner
from .agent_definition import create_travel_agent
from .tools import calculate_travel_time

async def start_interactive_session():
    """Main async entry point for the local test session."""
    required_vars = ["GOOGLE_CLOUD_PROJECT", "VOYAGE_API_KEY", "GOOGLE_MAPS_API_KEY"]
    if missing := [v for v in required_vars if not os.getenv(v)]:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        return

    my_app = create_travel_agent()
    user_id, session_id = "user_savannah_test", "session_001"
    anchor_geo, anchor_name = None, None
    pending_violations = []

    async with InMemoryRunner(app=my_app, app_name="my_travel_aigent") as runner:
        await runner.session_service.create_session(
            app_name="my_travel_aigent",
            user_id=user_id,
            session_id=session_id
        )

        print("\n--- My-Travel-Aigent-Brain: Interactive MVP Session ---")
        print("Mission: Plan a trip to Savannah for a couple from Duluth, GA.")
        print("Type 'exit' to quit.\n")

        while True:
            user_input = input("You: ")
            if user_input.lower() in ["exit", "quit", "q"]:
                break

            message = genai_types.Content(
                role="user", 
                parts=[genai_types.Part(text=user_input)]
            )
            
            # Pass gathered violations to Gemini via state_delta
            state_delta = {"proximity_violations": "\n".join(pending_violations)} if pending_violations else {}
            pending_violations = [] 

            print("Agent: ", end="", flush=True)
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
                state_delta=state_delta
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    if part.text:
                        print(part.text, end="", flush=True)

                    # Logistical Monitor
                    if part.tool_response and part.tool_response.name == "search_places":
                        try:
                            venues = json.loads(part.tool_response.response)
                            if not venues: continue
                            
                            top_venue = venues[0]
                            if any(t in ["hotel", "lodging"] for t in top_venue.get("types", [])):
                                anchor_geo = top_venue["geo"]
                                anchor_name = top_venue["name"]
                            elif anchor_geo:
                                travel_mins = calculate_travel_time(anchor_geo, top_venue["geo"])
                                if travel_mins > 30:
                                    msg = f"- '{top_venue['name']}' is {travel_mins} mins from {anchor_name}."
                                    pending_violations.append(msg)
                                    print(f"\033[93m\n[PROXIMITY WARNING] {msg}\033[0m")
                        except Exception: continue
            print("\n")

if __name__ == "__main__":
    asyncio.run(start_interactive_session())
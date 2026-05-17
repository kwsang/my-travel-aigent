import os
import json
import asyncio
import logging
from google.genai import types as genai_types
from google.adk.runners import InMemoryRunner
import agent_definition

# Suppress the noisy SDK warning about non-text parts in responses
logging.getLogger('google_genai.types').setLevel(logging.ERROR)

# Suppress ADK Experimental Feature Warnings
os.environ["ADK_SUPPRESS_EXPERIMENTAL_FEATURE_WARNINGS"] = "true"

async def start_interactive_session():
    """Main async entry point for the local test session."""
    required_vars = [
        "GOOGLE_CLOUD_PROJECT", 
        "VOYAGE_API_KEY", 
        "GOOGLE_MAPS_API_KEY", 
        "BIGQUERY_DATASET"
    ]
    if missing := [v for v in required_vars if not os.getenv(v)]:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        return

    my_app = agent_definition.create_travel_agent()
    user_id, session_id = "user_savannah_test", "session_001"

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
            
            print("Agent: ", end="", flush=True)
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
                # The LogisticsMonitorPlugin now handles proximity_violations internally
                state_delta={} 
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    # 1. Handle Text Output (Filtering out model thoughts)
                    if part.text and not part.thought:
                        print(part.text, end="", flush=True)
            print("\n")

if __name__ == "__main__":
    asyncio.run(start_interactive_session())

    
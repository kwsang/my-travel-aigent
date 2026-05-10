import os
import json
import asyncio
import yaml
import vertexai
from google.genai import types as genai_types
import voyageai
from google.adk import Agent
from google.adk.apps.app import App
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.agents.invocation_context import InvocationContext as Context
from google.adk.runners import InMemoryRunner
from google.adk.sessions import Session
from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# 1. Project Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
vertexai.init(project=PROJECT_ID, location=LOCATION)

# Initialize clients globally to reuse connections across tool calls
voyage_client = voyageai.Client(api_key=os.environ.get("VOYAGE_API_KEY"))
mongo_client = MongoClient(os.environ.get("MONGODB_URI"))
db = mongo_client["my-travel-aigent"]
destinations_collection = db["destinations"]

def record_user_profile(profile: dict, ctx: Context) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Call this tool once the user has provided all required elicitation data.
    """
    # Enforce Couple-First Pricing Logic: 
    # If party size is exactly 2, default to Trip Total (group_planning_per_person = False)
    prefs = profile.get("preferences", {})
    party = prefs.get("party_size", {})
    total_people = party.get("adults", 0) + party.get("children", 0)
    
    if total_people == 2 and "group_planning_per_person" not in prefs:
        prefs["group_planning_per_person"] = False

    # context.state is the primary way to manage data flow
    ctx.state.update({"user_profile_data": profile})
    return "User profile recorded successfully. Transitioning to Architect mode."

def search_activities(query: str, min_rating: float = 4.5) -> str:
    """
    Performs a semantic search for travel activities and destinations using MongoDB Vector Search.

    Args:
        query: The semantic search query or 'vibe' (e.g., 'romantic palaces').
        min_rating: The minimum rating threshold (default 4.5).

    Returns:
        A JSON string containing matching destinations and their metadata.
    """
    try:
        # 2. Generate query embedding
        embedding = voyage_client.embed([query], model="voyage-4", input_type="query").embeddings[0]

        # 3. Vector Search Pipeline
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "description_embedding",
                    "queryVector": embedding,
                    "numCandidates": 100,
                    "limit": 5,
                    "filter": {"rating": {"$gte": min_rating}}
                }
            },
            {"$project": {"_id": 0, "description_embedding": 0}}
        ]

        results = list(destinations_collection.aggregate(pipeline))
        if not results:
            return f"No activities or destinations found matching '{query}' with a minimum rating of {min_rating}. Please try a different vibe or location."
            
        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error during semantic search: {str(e)}"

def create_travel_agent():
    """
    Defines and initializes the My-Travel-Aigent-Brain using the ADK.
    Orchestrates the transition between Concierge (Elicitation) and Architect (Planning).
    """

    # 2. Define Tools (Superpowers)
    # We map our validated OpenAPI specs from the mcp folder
    specs_dir = os.path.join(os.path.dirname(__file__), "..", "mcp", "openapi-specs")

    def load_spec(filename):
        """Helper to load YAML and return as JSON string for OpenAPIToolset."""
        path = os.path.join(specs_dir, filename)
        with open(path, "r") as f:
            return json.dumps(yaml.safe_load(f))

    # 2.1 Function-based Tools
    record_profile_tool = FunctionTool(
        func=record_user_profile
    )

    search_tool = FunctionTool(
        func=search_activities
    )

    # 2.2 OpenAPI-based Toolsets
    # Each toolset can contain multiple tools if defined in the spec
    maps_toolset = OpenAPIToolset(spec_str=load_spec("google_maps_matrix_openapi.yaml"), spec_str_type='json')
    places_toolset = OpenAPIToolset(spec_str=load_spec("google_places_details_openapi.yaml"), spec_str_type='json')
    profile_toolset = OpenAPIToolset(spec_str=load_spec("query_user_profile_openapi.yaml"), spec_str_type='json')
    save_toolset = OpenAPIToolset(spec_str=load_spec("save_itinerary_openapi.yaml"), spec_str_type='json')

    # 3. Load Instruction Prompts
    prompts_dir = os.path.join(os.path.dirname(__file__), "prompts")

    with open(os.path.join(prompts_dir, "SYSTEM_PROMPT.md"), "r") as f:
        system_instructions = f.read()

    with open(os.path.join(prompts_dir, "ELICITATION_PROMPT.md"), "r") as f:
        concierge_goal = f.read()

    with open(os.path.join(prompts_dir, "ARCHITECT_PROMPT.md"), "r") as f:
        architect_goal = f.read()

    # 4. Define Instruction Provider using Context
    def get_instructions(ctx: Context) -> str:
        """
        Dynamic instruction provider that utilizes Context to manage session-wide state.
        """
        # Mission State Machine: 
        # If profile is missing, the mission is Elicitation.
        if "user_profile_data" not in ctx.state:
            return concierge_goal

        # Once profile is recorded, the mission shifts to Architecture.
        return architect_goal

    # 5. Initialize the Agent
    agent = Agent(
        name="my_travel_aigent_brain",
        model="gemini-2.0-flash", # Aligned with ADK samples
        static_instruction=system_instructions, # Optimized for context caching
        instruction=get_instructions,
        tools=[search_tool, record_profile_tool, maps_toolset, places_toolset, profile_toolset, save_toolset],
        output_key="final_itinerary",
        description="A high-fidelity travel planner and concierge."
    )

    # 6. Create the App with Context Caching (as seen in samples)
    # This stores the large SYSTEM_PROMPT in cache to reduce latency.
    app = App(
        name="my_travel_aigent_app",
        root_agent=agent,
        context_cache_config=ContextCacheConfig(
            min_tokens=2048,
            ttl_seconds=600,
        )
    )
    
    return app

async def start_interactive_session():
    """Main async entry point for the local test session."""
    required_vars = ["GOOGLE_CLOUD_PROJECT", "VOYAGE_API_KEY", "GOOGLE_MAPS_API_KEY"]
    missing = [v for v in required_vars if not os.getenv(v)]
    
    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        return

    # Initialize the App wrapper
    my_app = create_travel_agent()
    user_id = "user_savannah_test"
    session_id = "session_001"

    # InMemoryRunner simplifies session/storage management for the MVP
    async with InMemoryRunner(
        app=my_app, 
        app_name="my_travel_aigent",
        auto_create_session=True
    ) as runner:
        print("\n--- My-Travel-Aigent-Brain: Interactive MVP Session ---")
        print("Mission: Plan a trip to Savannah for a couple from Duluth, GA.")
        print("Type 'exit' to quit.\n")

        while True:
            user_input = input("You: ")
            if user_input.lower() in ["exit", "quit", "q"]:
                break

            # Wrap input in the required GenAI content type
            message = genai_types.Content(
                role="user", 
                parts=[genai_types.Part(text=user_input)]
            )

            print("Agent: ", end="", flush=True)
            # Iterate through the event stream yielded by run_async
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            print(part.text, end="", flush=True)
            print("\n")

if __name__ == "__main__":
    asyncio.run(start_interactive_session())
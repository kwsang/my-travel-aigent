import os
import json
import asyncio
import yaml
import vertexai
from google.genai import types as genai_types
import voyageai
from google.adk.agents import Agent
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

def search_destinations(query: str) -> str:
    """
    Performs a semantic search for travel destinations (strictly cities and towns) using MongoDB Vector Search.

    Args:
        query: The semantic search query or 'vibe' for a city (e.g., 'historic coastal towns').

    Returns:
        A JSON string containing matching cities/towns and their geographic context.
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
                    "limit": 5
                }
            },
            {"$project": {"_id": 0, "description_embedding": 0}}
        ]

        results = list(destinations_collection.aggregate(pipeline))
        if not results:
            return f"No destinations found matching '{query}'. Please try a different vibe or location."
            
        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error during semantic search: {str(e)}"

def search_places(text_query: str, location_bias: str = None, location_type: str = None) -> str:
    """
    Searches for specific venues (hotels, restaurants, attractions) using the Google Places API.

    Args:
        text_query: The specific search (e.g., 'romantic hotels in Savannah').
        location_bias: Optional destination to focus the search.
        location_type: Optional Google Place type to filter results (e.g., 'hotel', 'restaurant').

    Returns:
        A JSON string of venues including priceLevel, rating, and addresses.
    """
    try:
        mask = "places.displayName,places.id,places.editorialSummary,places.rating,places.priceLevel,places.formattedAddress,places.location"
        query = f"{text_query} in {location_bias}" if location_bias else text_query
        
        request = {"text_query": query, "max_result_count": 8}
        if location_type:
            request["included_type"] = location_type
            
        response = places_client.search_text(request=request, metadata=[("x-goog-fieldmask", mask)])
        
        venues = []
        for place in response.places:
            venues.append({
                "name": place.display_name.text,
                "place_id": place.id,
                "rating": place.rating,
                "price_tier": place.price_level,
                "description": place.editorial_summary.text if place.editorial_summary else place.formatted_address,
                "geo": {"latitude": place.location.latitude, "longitude": place.location.longitude}
            })
        
        return json.dumps(venues, default=str)
    except Exception as e:
        return f"Error searching Google Places: {str(e)}"

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
        func=search_destinations
    )

    places_search_tool = FunctionTool(
        func=search_places
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
        tools=[search_tool, places_search_tool, record_profile_tool, maps_toolset, places_toolset, profile_toolset, save_toolset],
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
        app_name="my_travel_aigent"
    ) as runner:
        # Explicitly create the session since auto_create_session is not supported
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
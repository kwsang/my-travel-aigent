import os
import json
import yaml
from google.adk.agents import Agent
from google.adk.apps.app import App
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.agents.invocation_context import InvocationContext as Context
from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset

from .plugins.logistics_monitor import LogisticsMonitorPlugin
from .tools.tools import (
    record_user_profile, 
    search_destinations, 
    discover_new_destination, 
    search_places,
    query_user_profile,
    save_itinerary,
    google_maps_matrix,
    google_places_details
)

def create_travel_agent():
    """
    Defines and initializes the My-Travel-Aigent-Brain using the ADK.
    Orchestrates the transition between Concierge (Elicitation) and Architect (Planning).
    """
    # 2.1 Function-based Tools
    record_profile_tool = FunctionTool(func=record_user_profile)
    search_tool = FunctionTool(func=search_destinations)
    discovery_tool = FunctionTool(func=discover_new_destination)
    places_search_tool = FunctionTool(func=search_places)
    
    # Local Python-based versions of the MCP/API tools to avoid Protocol errors
    get_profile_tool = FunctionTool(func=query_user_profile)
    persist_tool = FunctionTool(func=save_itinerary)
    traffic_tool = FunctionTool(func=google_maps_matrix)
    details_tool = FunctionTool(func=google_places_details)

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
        # 1. Mission State Machine
        if "user_profile_data" not in ctx.state:
            return concierge_goal

        # 2. Architect Mode
        # Remove concierge_goal to prevent redundant elicitation behavior during planning.
        prompt = f"{system_instructions}\n\n{architect_goal}"

        # 3. Dynamic Injection: Check for Proximity Violations in State
        violations = ctx.state.get("proximity_violations")
        if violations:
            prompt += f"\n\n[SYSTEM MONITOR ALERT]\nThe following logistical violations were detected:\n{violations}\nYou MUST address these by finding closer alternatives."

        return prompt

    # 5. Initialize the Agent
    agent = Agent(
        name="my_travel_aigent_brain",
        model="gemini-2.5-flash", # Aligned with ADK samples
        static_instruction=system_instructions, # Optimized for context caching
        instruction=get_instructions,
        tools=[
            search_tool, 
            discovery_tool, 
            places_search_tool, 
            record_profile_tool, 
            get_profile_tool, 
            persist_tool, 
            traffic_tool, 
            details_tool
        ],
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
        ),
        plugins=[LogisticsMonitorPlugin()]
    )
    
    return app
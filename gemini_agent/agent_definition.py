import os
import json
import yaml
from google.adk.agents import Agent
from google.adk.apps.app import App
from google.genai import types as genai_types
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.agents.invocation_context import InvocationContext as Context
from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset

from gemini_agent.plugins.logistics_monitor import LogisticsMonitorPlugin
from gemini_agent.tools.tools import (
    record_user_profile, 
    search_destinations, 
    discover_new_destination, 
    search_places,
    query_user_profile,
    get_itinerary,
    list_trip_versions,
    delete_itinerary,
    update_itinerary_status,
    clone_itinerary,
    save_itinerary,
    finalize_itinerary,
    google_maps_matrix,
    google_places_details,
    search_local_events
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
    events_tool = FunctionTool(func=search_local_events)
    retrieve_itinerary_tool = FunctionTool(func=get_itinerary)
    list_versions_tool = FunctionTool(func=list_trip_versions)
    delete_itinerary_tool = FunctionTool(func=delete_itinerary)
    update_status_tool = FunctionTool(func=update_itinerary_status)
    finalize_tool = FunctionTool(func=finalize_itinerary)
    clone_tool = FunctionTool(func=clone_itinerary)
    
    # Local Python-based versions of the MCP/API tools to avoid Protocol errors
    get_profile_tool = FunctionTool(func=query_user_profile)
    persist_tool = FunctionTool(func=save_itinerary)
    traffic_tool = FunctionTool(func=google_maps_matrix)
    details_tool = FunctionTool(func=google_places_details)

    # 2.2 Shared Model Configuration
    # Note: Generation parameters like temperature are often handled via defaults 
    # in the ADK to satisfy strict Pydantic V2 validation in the Agent constructor.
    model_config = {}

    # 3. Load Instruction Prompts
    prompts_dir = os.path.join(os.path.dirname(__file__), "prompts")

    with open(os.path.join(prompts_dir, "SYSTEM_PROMPT.md"), "r") as f:
        system_instructions = f.read()

    with open(os.path.join(prompts_dir, "ELICITATION_PROMPT.md"), "r") as f:
        concierge_goal = f.read()

    with open(os.path.join(prompts_dir, "ARCHITECT_PROMPT.md"), "r") as f:
        architect_goal = f.read()

    # 4. Define specialized Agents
    
    # 4.1 Concierge: Focused on user profiling and data gathering
    concierge_agent = Agent(
        name="concierge",
        model="gemini-1.5-flash",
        static_instruction=system_instructions,
        config=model_config,
        instruction=concierge_goal,
        tools=[
            record_profile_tool, 
            get_profile_tool, 
            events_tool, 
            retrieve_itinerary_tool,
            list_versions_tool,
            delete_itinerary_tool,
            update_status_tool,
            finalize_tool,
            clone_tool
        ],
        description="Welcomes the user, gathers travel preferences, and proactively suggests local events to improve engagement."
    )

    # 4.2 Architect: Focused on logistics, search, and planning
    def get_architect_instructions(ctx: Context) -> str:
        prompt = architect_goal
        # Dynamic Injection: Check for Proximity Violations in State
        violations = ctx.state.get("proximity_violations")
        if violations:
            prompt += f"\n\n[SYSTEM MONITOR ALERT]\nThe following logistical violations were detected:\n{violations}\nYou MUST address these by finding closer alternatives."
        return prompt

    architect_agent = Agent(
        name="architect",
        model="gemini-1.5-flash",
        static_instruction=system_instructions,
        config=model_config,
        instruction=get_architect_instructions,
        tools=[
            search_tool, 
            discovery_tool, 
            places_search_tool, 
            persist_tool, 
            traffic_tool, 
            details_tool,
            retrieve_itinerary_tool,
            list_versions_tool,
            delete_itinerary_tool,
            update_status_tool,
            finalize_tool,
            clone_tool
        ],
        output_key="final_itinerary",
        description="Expert travel planner. Researches destinations, venues, and travel times to build high-fidelity itineraries."
    )

    # 4.3 Supervisor: The Root Agent that orchestrates handoffs
    def supervisor_instructions(ctx: Context) -> str:
        # Decide which specialist should handle the turn based on the existence of profile data
        if "user_profile_data" not in ctx.state:
            return (
                "You are the Travel Supervisor. We do not have the user's travel preferences yet. "
                "Transfer the user to the 'concierge' to begin the intake process."
            )
        
        # Contextual Handoff: Mention if we are resuming a draft
        handoff_context = "The user's preferences are recorded."
        if "active_itinerary" in ctx.state:
            # Conflict Detection: Check for Starting Location mismatch
            profile_start = ctx.state.get("user_profile_data", {}).get("preferences", {}).get("starting_location")
            itinerary_start = ctx.state.get("active_itinerary", {}).get("metadata", {}).get("starting_location")
            
            if profile_start and itinerary_start and profile_start != itinerary_start:
                handoff_context += f" [CONFLICT ALERT] The user profile starting location is '{profile_start}', but this draft itinerary starts from '{itinerary_start}'."

            handoff_context += " A draft itinerary exists in 'active_itinerary'. Instruct the 'architect' to resume from this version."

        return (
            f"You are the Travel Supervisor. {handoff_context} "
            "Transfer the user to the 'architect' to handle research and itinerary building. "
            "Once an itinerary is built, ensure the user is satisfied."
        )

    supervisor = Agent(
        name="travel_supervisor",
        model="gemini-1.5-flash",
        config=model_config,
        instruction=supervisor_instructions,
        sub_agents=[concierge_agent, architect_agent],
        description="Orchestrates the travel planning process between the Concierge and the Architect."
    )

    # 6. Create the App with Context Caching (as seen in samples)
    # This stores the large SYSTEM_PROMPT in cache to reduce latency.
    plugins = [LogisticsMonitorPlugin()]

    app = App(
        name="my_travel_aigent",
        root_agent=supervisor,
        context_cache_config=ContextCacheConfig(
            min_tokens=2048,
            ttl_seconds=600,
        ),
        plugins=plugins
    )
    
    return app
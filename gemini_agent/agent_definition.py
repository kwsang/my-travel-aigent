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

    # 3. Load Instruction Prompts
    prompts_dir = os.path.join(os.path.dirname(__file__), "prompts")

    with open(os.path.join(prompts_dir, "SYSTEM_PROMPT.md"), "r") as f:
        system_instructions = f.read()

    with open(os.path.join(prompts_dir, "ELICITATION_PROMPT.md"), "r") as f:
        concierge_goal = f.read()

    with open(os.path.join(prompts_dir, "ARCHITECT_PROMPT.md"), "r") as f:
        architect_goal = f.read()

    with open(os.path.join(prompts_dir, "PIONEER_PROMPT.md"), "r") as f:
        pioneer_goal = f.read()

    with open(os.path.join(prompts_dir, "ACTIVITY_PLANNER_PROMPT.md"), "r") as f:
        activity_planner_goal = f.read()

    # 4. Define specialized Agents
    
    # 4.1 Concierge: Focused on user profiling and data gathering
    concierge_agent = Agent(
        name="concierge",
        model="gemini-2.5-flash", # gemini-1.5-flash is a hallucination
        static_instruction=system_instructions,
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
        
        # Defensive state retrieval: Context > Session > Empty
        state = getattr(ctx, "state", getattr(ctx.session, "state", {}))
        
        # Dynamic Injection: Check for Proximity Violations in State
        violations = state.get("proximity_violations")
        if violations:
            prompt += f"\n\n[SYSTEM MONITOR ALERT]\nThe following logistical violations were detected:\n{violations}\nYou MUST address these by finding closer alternatives."
        
        # Add explicit formatting rules to ensure reliable UI splitting
        prompt += "\n\nFORMATTING RULE: Use Markdown H3 headers ('### Section Name') for all major itinerary components (e.g., '### Accommodation', '### Transport', '### Dining', '### Day 1'). Do not use these headers for regular text."
        
        return prompt

    pioneer_agent = Agent(
        name="travel_pioneer",
        model="gemini-2.5-flash",
        static_instruction=system_instructions,
        instruction=pioneer_goal,
        tools=[search_tool, discovery_tool, places_search_tool, traffic_tool, details_tool],
        description="Specializes in geographic anchoring, transportation, and finding the perfect destination and accommodation."
    )

    activity_planner_agent = Agent(
        name="activity_planner",
        model="gemini-2.5-flash",
        static_instruction=system_instructions,
        instruction=activity_planner_goal,
        tools=[places_search_tool, events_tool, traffic_tool, details_tool],
        description="Fills the itinerary with incredible EXPERIENCE and DINING segments that match the user's interests, vibe, and circadian rhythm."
    )

    architect_agent = Agent(
        name="architect",
        model="gemini-2.5-flash", # gemini-1.5-flash is a hallucination
        static_instruction=system_instructions,
        instruction=get_architect_instructions,
        tools=[
            persist_tool, 
            retrieve_itinerary_tool,
            list_versions_tool,
            delete_itinerary_tool,
            update_status_tool,
            finalize_tool,
            clone_tool
        ],
        sub_agents=[pioneer_agent, activity_planner_agent],
        output_key="final_itinerary",
        description="Expert travel planner. Researches destinations, venues, and travel times to build high-fidelity itineraries."
    )

    # 4.3 Supervisor: The Root Agent that orchestrates handoffs
    def supervisor_instructions(ctx: Context) -> str:
        # Defensive state retrieval
        state = getattr(ctx, "state", getattr(ctx.session, "state", {}))

        # The chat route injects the itinerary into 'final_itinerary'
        itinerary_data = state.get("final_itinerary", {})
        if isinstance(itinerary_data, str):
            try: itinerary_data = json.loads(itinerary_data)
            except: itinerary_data = {}
            
        destination = itinerary_data.get("destination")
        map_context = f" The user has explicitly selected '{destination}' as their destination from the map." if destination else ""

        # Decide which specialist should handle the turn based on the existence of profile data
        if "user_profile_data" not in state or not state.get("user_profile_data"):
            return (
                f"You are the Travel Supervisor.{map_context} We do not have the user's full travel preferences yet. "
                "Transfer the user to the 'concierge' to begin the intake process. If a destination is selected, instruct the concierge to accept it and move to the next question."
            )
        
        # Contextual Handoff: Mention if we are resuming a draft
        handoff_context = "The user's preferences are recorded."
        if itinerary_data:
            profile_data = state.get("user_profile_data", {})
            if isinstance(profile_data, str):
                try: profile_data = json.loads(profile_data)
                except: profile_data = {}
                
            # Conflict Detection: Check for Starting Location mismatch
            profile_start = profile_data.get("preferences", {}).get("starting_location")
            itinerary_start = itinerary_data.get("metadata", {}).get("starting_location")
            
            if profile_start and itinerary_start and profile_start != itinerary_start:
                handoff_context += f" [CONFLICT ALERT] The user profile starting location is '{profile_start}', but this draft itinerary starts from '{itinerary_start}'."

            handoff_context += f"{map_context} A draft itinerary exists in 'final_itinerary'. Instruct the 'architect' to resume from this version."

        return (
            f"You are the Travel Supervisor. {handoff_context} "
            "Transfer the user to the 'architect' (which will delegate to its sub-agents) to handle research and itinerary building. "
            "Once an itinerary is built, ensure the user is satisfied."
        )

    supervisor = Agent(
        name="travel_supervisor",
        model="gemini-2.5-flash", # gemini-1.5-flash is a hallucination
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
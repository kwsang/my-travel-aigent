import os
import json
import copy
import yaml
import logging
from google.adk.agents import Agent
from google.adk.apps.app import App
from google.genai import types as genai_types
from google.adk.agents.invocation_context import InvocationContext as Context
from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset

from gemini_agent.plugins.logistics_monitor import LogisticsMonitorPlugin
from gemini_agent.plugins.timing_plugin import ExecutionTimingPlugin
from gemini_agent.plugins.inter_agent_logger import InterAgentLoggingPlugin
from gemini_agent.logic.models import TravelerProfile
from gemini_agent.tools.tools import (
    record_user_profile, 
    search_destinations, 
    discover_new_destination, 
    save_destination_lodging,
    save_destination_activities,
    get_cached_lodging,
    get_cached_activities,
    search_places,
    query_user_profile,
    get_itinerary,
    list_trip_versions,
    delete_itinerary,
    update_itinerary_status,
    clone_itinerary,
    save_itinerary,
    finalize_itinerary,
    search_local_events,
    vector_search_places,
    read_draft_itinerary,
    calculate_budget,
    save_to_scratchpad,
    get_top_items_from_scratchpad
)
from gemini_agent.logic.utils import get_state_context

logger = logging.getLogger(__name__)

def create_travel_agent():
    """
    Defines and initializes the My-Travel-Aigent-Brain using the ADK.
    Orchestrates the transition between Concierge (Elicitation) and Architect (Planning).
    """
    # 2.1 Function-based Tools
    record_profile_tool = FunctionTool(func=record_user_profile)
    search_tool = FunctionTool(func=search_destinations)
    discovery_tool = FunctionTool(func=discover_new_destination)
    save_dest_acc_tool = FunctionTool(func=save_destination_lodging)
    save_dest_act_tool = FunctionTool(func=save_destination_activities)
    get_cached_acc_tool = FunctionTool(func=get_cached_lodging)
    get_cached_act_tool = FunctionTool(func=get_cached_activities)
    places_search_tool = FunctionTool(func=search_places)
    events_tool = FunctionTool(func=search_local_events)
    vector_search_tool = FunctionTool(func=vector_search_places)
    retrieve_itinerary_tool = FunctionTool(func=get_itinerary)
    list_versions_tool = FunctionTool(func=list_trip_versions)
    delete_itinerary_tool = FunctionTool(func=delete_itinerary)
    update_status_tool = FunctionTool(func=update_itinerary_status)
    finalize_tool = FunctionTool(func=finalize_itinerary)
    clone_tool = FunctionTool(func=clone_itinerary)
    
    # Local Python-based versions of the MCP/API tools to avoid Protocol errors
    get_profile_tool = FunctionTool(func=query_user_profile)
    persist_tool = FunctionTool(func=save_itinerary)
    
    # Phase 1 State Management & Scratchpad Tools
    read_draft_tool = FunctionTool(func=read_draft_itinerary)
    calc_budget_tool = FunctionTool(func=calculate_budget)
    save_scratchpad_tool = FunctionTool(func=save_to_scratchpad)
    get_scratchpad_tool = FunctionTool(func=get_top_items_from_scratchpad)
    
    # Group tools by domain to easily share them across agents
    ITINERARY_MANAGEMENT_TOOLS = [
        persist_tool, 
        retrieve_itinerary_tool,
        list_versions_tool,
        delete_itinerary_tool,
        update_status_tool,
        finalize_tool,
        clone_tool,
        read_draft_tool,
        calc_budget_tool
    ]
    
    RESEARCH_TOOLS = [
        places_search_tool,
        vector_search_tool,
        search_tool,
        events_tool,
        save_scratchpad_tool,
        get_scratchpad_tool
    ]

    # 3. Load Instruction Prompts
    prompts_dir = os.path.join(os.path.dirname(__file__), "prompts")

    with open(os.path.join(prompts_dir, "SYSTEM_PROMPT.md"), "r") as f:
        system_instructions = f.read()

    with open(os.path.join(prompts_dir, "ELICITATION_PROMPT.md"), "r") as f:
        concierge_goal = f.read()

    with open(os.path.join(prompts_dir, "ARCHITECT_PROMPT.md"), "r") as f:
        architect_goal = f.read()

    # Helper to safely parse stringified JSON states for prompt injection
    def _get_safe_state(ctx: Context):
        itinerary, profile = get_state_context(ctx)
            
        return profile, itinerary

    # 4. Define specialized Agents
    
    # 4.1 Concierge: Focused on user profiling and data gathering
    def get_concierge_instructions(ctx: Context) -> str:
        profile, itinerary = _get_safe_state(ctx)
        return f"{concierge_goal}\n\n### Current UI State\nProfile: {json.dumps(profile, default=str)}\nItinerary: {json.dumps(itinerary, default=str)}"

    concierge_agent = Agent(
        name="concierge",
        model="gemini-2.5-flash", # gemini-1.5-flash is a hallucination
        static_instruction=system_instructions,
        instruction=get_concierge_instructions,
        tools=[
            record_profile_tool, 
            get_profile_tool,
            *ITINERARY_MANAGEMENT_TOOLS,
            save_dest_acc_tool,
            save_dest_act_tool,
            get_cached_acc_tool,
            get_cached_act_tool,
            *RESEARCH_TOOLS
        ],
        description="Welcomes the user, gathers travel preferences, and proactively suggests local events to improve engagement."
    )

    # 4.2 Architect: Focused on logistics, search, and planning
    def get_architect_instructions(ctx: Context) -> str:
        prompt = f"{architect_goal}"

        profile, itinerary = _get_safe_state(ctx)
        state = getattr(ctx, "state", getattr(ctx.session, "state", {})) # Keep for violations
        
        # Dynamic Injection: Check for Proximity Violations in State
        violations = state.get("proximity_violations")
        if violations:
            prompt += f"\n\n[SYSTEM MONITOR ALERT]\nThe following logistical violations were detected:\n{violations}\nYou MUST address these by finding closer alternatives."
        
        # Add explicit formatting rules to ensure reliable UI splitting
        prompt += "\n\nFORMATTING RULE: Use Markdown H3 headers ('### Section Name') for all major itinerary components (e.g., '### Lodging', '### Transport', '### Dining', '### Day 1'). Do not use these headers for regular text."
        
        # Explicitly enforce exact dates if they exist in the profile
        prefs = profile.get("preferences") or {}
        start_date = prefs.get("start_date")
        end_date = prefs.get("end_date")
        duration = prefs.get("target_duration_days")
        min_rating = prefs.get("min_rating")
        
        if start_date and end_date:
            prompt += f"\n\n[STRICT DATE CONSTRAINT]\nThe user has explicitly requested dates from {start_date} to {end_date} (Duration: {duration} Days). Every generated event MUST be scheduled strictly within this exact window. Day 1 MUST begin on {start_date}."
        elif duration:
            prompt += f"\n\n[STRICT DATE CONSTRAINT]\nThe user has explicitly requested a trip duration of {duration} Days. Ensure the itinerary covers exactly {duration} days."

        if min_rating:
            prompt += f"\n\n[QUALITY CONSTRAINT]\nThe user has explicitly requested a minimum rating of {min_rating} stars. You MUST strictly filter out and NEVER suggest any lodging, dining, or activity with a rating below {min_rating}."

        prompt += "\n\n[TRANSIT RULE]\nDo NOT generate or schedule `TRANSPORT` segments for commuting between local activities. Only schedule the actual `EXPERIENCE` and `DINING` events, and primary transit (flights/driving to the destination)."
        prompt += "\n\n[STATE PERSISTENCE]\nYou MUST use the `save_itinerary` tool to persist any updates to the itinerary directly to the global state. When calling `save_itinerary`, you MUST pass the FULL, complete `events` array (formatted as a JSON string) including all previously scheduled events. To save tokens, your `details` objects only need to include the `name`, `category`, and `price` of the venue; the system will automatically attach the remaining details. Do not pass a partial list of only new events, or the old events will be deleted! ONLY call this tool if you have actually modified the itinerary; do not call it redundantly if no changes were made."
        prompt += f"\n\n### Current UI State\nProfile: {json.dumps(profile, default=str)}\nItinerary: {json.dumps(itinerary, default=str)}"
        return prompt

    architect_agent = Agent(
        name="architect",
        model="gemini-2.5-flash", # gemini-1.5-flash is a hallucination
        static_instruction=system_instructions,
        instruction=get_architect_instructions,
        tools=[
            discovery_tool, get_cached_acc_tool, save_dest_acc_tool, 
            get_cached_act_tool, save_dest_act_tool, 
            *ITINERARY_MANAGEMENT_TOOLS, *RESEARCH_TOOLS
        ],
        output_key="final_itinerary",
        description="Expert travel planner. Researches destinations, finds lodging, schedules activities, and builds high-fidelity itineraries."
    )

    # 4.3 Supervisor: The Root Agent that orchestrates handoffs
    def supervisor_instructions(ctx: Context) -> str:
        # Defensive state retrieval
        state = getattr(ctx, "state", None) or getattr(ctx.session, "state", None) or {}

        # The chat route injects the itinerary into 'final_itinerary'
        itinerary_data = state.get("final_itinerary") or {}
        if isinstance(itinerary_data, str):
            try: itinerary_data = json.loads(itinerary_data)
            except: itinerary_data = {}
            
        destination = itinerary_data.get("destination")
        map_context = f" The user has explicitly selected '{destination}' as their destination from the map. Please ensure you explicitly qualify its state and country to avoid ambiguity." if destination else ""

        profile_data = state.get("traveler_profile") or state.get("user_profile_data")
        logger.info(f"[SUPERVISOR] Evaluated State -> Destination: {destination}, Profile Exists: {bool(profile_data)}")

        # Decide which specialist should handle the turn based on the existence of profile data
        if not profile_data:
            return (
                f"You are the Travel Supervisor.{map_context} We do not have the user's full travel preferences yet. "
                "Transfer the user to the 'concierge' to begin the intake process. If a destination is selected, instruct the concierge to accept it and move to the next question."
            )
        
        # Contextual Handoff: Mention if we are resuming a draft
        handoff_context = "The user's preferences are recorded."
        if itinerary_data:
            if isinstance(profile_data, str):
                try: profile_data = json.loads(profile_data)
                except: profile_data = {}
                
            # Conflict Detection: Check for Starting Location mismatch
            profile_start = profile_data.get("preferences", {}).get("starting_location")
            itinerary_start = itinerary_data.get("metadata", {}).get("starting_location")
            
            if profile_start and itinerary_start and profile_start != itinerary_start:
                handoff_context += f" [CONFLICT ALERT] The user profile starting location is '{profile_start}', but this draft itinerary starts from '{itinerary_start}'."

            events = itinerary_data.get("events") or []
            if len(events) > 0:
                target_duration = profile_data.get("preferences", {}).get("target_duration_days", 0)
                max_day_planned = max([e.get("day", 0) for e in events if e.get("segment") in ["EXPERIENCE", "DINING"]], default=0)
                
                if target_duration and max_day_planned < target_duration:
                    handoff_context += f"{map_context} The itinerary is partially planned (up to Day {max_day_planned} of {target_duration}). Instruct the 'architect' to continue scheduling."
                else:
                    handoff_context += f"{map_context} A draft itinerary exists. Instruct the 'architect' to review and refine it."
            elif destination or itinerary_data.get("lodging"):
                handoff_context += f"{map_context} The destination or lodging is set. Instruct the 'architect' to schedule transit and daily activities."

        logger.info(f"[SUPERVISOR] Handoff Context: {handoff_context}")

        return (
            f"You are the Travel Supervisor. {handoff_context} "
            "You MUST use your provided agent transfer tools to handoff the conversation. "
            "If the handoff context explicitly instructs you to invoke a specific tool, you MUST prioritize that instruction. "
            "If the user asks specifically about planning, travel, lodging, activities, or dining, invoke the 'call_architect' tool to handle research and itinerary coordination. "
            "Once an itinerary is built, ensure the user is satisfied. NEVER just say you are transferring without actually invoking the tool.\n"
            "IMPORTANT: The ONLY valid agents you can transfer to are 'concierge' and 'architect'. Do not attempt to transfer to 'travel_pioneer'."
        )

    supervisor = Agent(
        name="supervisor",
        model="gemini-2.5-flash", # gemini-1.5-flash is a hallucination
        instruction=supervisor_instructions,
        sub_agents=[concierge_agent, architect_agent],
        description="Orchestrates the travel planning process between the Concierge, Architect, and Specialists."
    )

    # 6. Create the App
    plugins = [LogisticsMonitorPlugin(), ExecutionTimingPlugin(), InterAgentLoggingPlugin()]

    app = App(
        name="my_travel_aigent",
        root_agent=supervisor,
        plugins=plugins
    )
    
    return app
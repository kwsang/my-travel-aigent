import json
import logging
from google.adk.plugins.base_plugin import BasePlugin
from tools.utils import calculate_travel_time

logger = logging.getLogger(__name__)

class LogisticsMonitorPlugin(BasePlugin):
    """
    ADK Plugin that monitors tool outputs for logistical constraints.
    Tracks the 'anchor' (hotel/lodging) and detects proximity violations.
    """
    def __init__(self):
        super().__init__(name="logistics_monitor")

    async def on_user_message_callback(self, *, invocation_context, user_message):
        """
        Automatically clears violations if the user confirms the plan.
        """
        # Extract combined text from user parts
        text = " ".join([p.text for p in user_message.parts if p.text]).lower()
        
        # Common confirmation markers
        confirmation_markers = ["looks good", "perfect", "that works", "great", "confirmed", "satisfied"]
        
        if any(marker in text for marker in confirmation_markers):
            if "proximity_violations" in invocation_context.state:
                invocation_context.state["proximity_violations"] = None
                logger.info("LogisticsMonitor: User confirmed plan; cleared proximity violations.")

    async def after_tool_callback(self, tool, tool_args, tool_context, result):
        """
        Intercepts tool results to update logistical state.
        """
        if tool.name != "search_places":
            return

        try:
            # Tools return JSON strings; parse to inspect results
            venues = json.loads(result)
            if not venues:
                return

            top_venue = venues[0]
            state = tool_context.state
            
            # Check if this is a hotel to set the anchor for the session
            is_lodging = any(t in ["hotel", "lodging"] for t in top_venue.get("types", []))
            
            if is_lodging:
                state["anchor_geo"] = top_venue["geo"]
                state["anchor_name"] = top_venue["name"]
                logger.info(f"LogisticsMonitor: Anchor set to '{top_venue['name']}'")
            else:
                anchor_geo = state.get("anchor_geo")
                anchor_name = state.get("anchor_name")
                
                if anchor_geo:
                    # Resolve personalized proximity threshold from user preferences
                    prefs = state.get("user_profile_data", {}).get("preferences", {})
                    density = prefs.get("activity_density", "medium")
                    threshold_map = {"high": 15, "medium": 30, "low": 60}
                    threshold = threshold_map.get(density, 30)

                    # Calculate travel time from the established anchor
                    travel_mins, travel_dist, travel_mode = calculate_travel_time(anchor_geo, top_venue["geo"])
                    if travel_mins > threshold:
                        msg = f"- '{top_venue['name']}' is {travel_mins} mins {travel_mode} from {anchor_name} ({travel_dist:.1f} miles)."
                        
                        # Update state with the violation so the Agent can see it in get_instructions
                        current_violations = state.get("proximity_violations", "")
                        state["proximity_violations"] = f"{current_violations}\n{msg}".strip()
                        
                        # Provide immediate feedback to the console
                        print(f"\033[93m\n[LOGISTICS MONITOR] {msg}\033[0m")
                    elif travel_mode != "unknown":
                        # Clear violations if a valid nearby location is found
                        if state.get("proximity_violations"):
                            state["proximity_violations"] = None
                            logger.info("LogisticsMonitor: Found nearby location; cleared violations.")
        except Exception:
            logger.debug("LogisticsMonitor: Skipped processing for non-standard tool output.")
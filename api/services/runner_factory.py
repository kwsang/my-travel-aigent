from google.adk.runners import Runner
from api.services.session_service import MongoDBSessionService
from gemini_agent import agent_definition
from api import config
from gemini_agent.logic.tools import search_places, google_places_details, google_maps_matrix # These are the Google API tools
from gemini_agent.tools.itinerary_tools import save_itinerary, get_itinerary, list_trip_versions, delete_itinerary, update_itinerary_status, clone_itinerary, finalize_itinerary
from gemini_agent.tools.user_management import record_user_profile, query_user_profile
from gemini_agent.tools.discovery import search_destinations, discover_new_destination
from gemini_agent.tools.tools import search_local_events

def create_agent_runner() -> Runner:
    """Factory to create and configure the ADK Runner and its dependencies."""
    agent_app = agent_definition.create_travel_agent()
    
    session_service = MongoDBSessionService(
        uri=config.MONGODB_URL,
        db_name=config.SESSION_DATABASE_NAME,
        collection_name=config.SESSION_COLLECTION
    )

    # Tools belong to the Agent (root_agent), not the App container.
    # We assign them to the root_agent's tools list so the Runner can discover them.
    agent_app.root_agent.tools = [
        search_places,
        google_places_details,
        google_maps_matrix,
        save_itinerary,
        get_itinerary,
        list_trip_versions,
        delete_itinerary,
        update_itinerary_status,
        clone_itinerary,
        finalize_itinerary,
        record_user_profile,
        query_user_profile,
        search_destinations,
        discover_new_destination,
        search_local_events,
    ]
    
    return Runner(
        app=agent_app, 
        session_service=session_service, # This is correct
        auto_create_session=True, # This is correct
    )
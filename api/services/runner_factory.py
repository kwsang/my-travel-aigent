from google.adk.runners import Runner
from api.services.session_service import MongoDBSessionService
from gemini_agent import agent_definition
from api import config

def create_agent_runner() -> Runner:
    """Factory to create and configure the ADK Runner and its dependencies."""
    agent_app = agent_definition.create_travel_agent()
    
    session_service = MongoDBSessionService(
        uri=config.MONGODB_URL,
        db_name=config.SESSION_DATABASE_NAME,
        collection_name=config.SESSION_COLLECTION
    )
    
    return Runner(
        app=agent_app, 
        session_service=session_service,
        auto_create_session=True
    )
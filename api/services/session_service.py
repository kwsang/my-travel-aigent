import json
import logging
from datetime import datetime, timezone
from typing import Any
from motor.motor_asyncio import AsyncIOMotorClient
from google.adk.events.event import Event
from google.adk.sessions import BaseSessionService
from google.adk.sessions.session import Session
from google.adk.sessions.base_session_service import ListSessionsResponse

logger = logging.getLogger(__name__)

class MongoDBSessionService(BaseSessionService):
    def __init__(self, uri, db_name, collection_name):
        super().__init__()
        self.client = AsyncIOMotorClient(uri)
        self.collection = self.client[db_name][collection_name]

    async def get_session(self, *, app_name: str, user_id: str, session_id: str, config: Any = None):
        logger.info(f"Fetching session: user={user_id}, session={session_id}")
        doc = await self.collection.find_one({"user_id": user_id, "session_id": session_id, "app_name": app_name})
        if not doc:
            logger.info(f"No session found for {session_id}")
            return None
        
        # Ensure state is a dictionary even if persisted as a JSON string
        state = doc["data"].get("state", {})
        if isinstance(state, str):
            try:
                state = json.loads(state)
            except Exception as e:
                logger.warning(f"Failed to parse stringified state: {e}")
                state = {}
        
        # Reconstruct Event objects for conversation history
        raw_history = doc["data"].get("history", [])
        history = []
        for e_dict in raw_history:
            history.append(Event.model_validate(e_dict))

        return Session(
            id=session_id,
            app_name=app_name,
            user_id=user_id,
            state=state,
            events=history
        )

    async def create_session(self, *, app_name: str, user_id: str, state: dict[str, Any] | None = None, session_id: str | None = None) -> Session:
        session_id = session_id or f"sess_{datetime.now().timestamp()}"
        await self.collection.insert_one({
            "user_id": user_id,
            "session_id": session_id,
            "app_name": app_name,
            "data": {"state": state or {}},
            "updated_at": datetime.now(timezone.utc)
        })
        return Session(
            id=session_id, 
            user_id=user_id, 
            app_name=app_name, 
            state=state or {},
            events=[]
        )

    async def append_event(self, session: Session, event: Any) -> Any:
        if event.partial:
            return event

        await super().append_event(session, event)
        
        history_json = [e.model_dump(mode='json') for e in session.events]
        await self.collection.update_one(
            {"user_id": session.user_id, "session_id": session.id, "app_name": session.app_name},
            {"$set": {
                "data": {"state": session.state, "history": history_json},
                "updated_at": datetime.now(timezone.utc)
            }},
            upsert=True
        )
        return event

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str):
        await self.collection.delete_one({"user_id": user_id, "session_id": session_id, "app_name": app_name})

    async def list_sessions(self, *, app_name: str, user_id: str | None = None) -> ListSessionsResponse:
        query = {"app_name": app_name}
        if user_id:
            query["user_id"] = user_id
            
        cursor = self.collection.find(query, {"session_id": 1, "user_id": 1, "data": 1, "_id": 0})
        sessions = []
        async for doc in cursor:
            state = doc["data"].get("state", {})
            if isinstance(state, str):
                try: state = json.loads(state)
                except: state = {}

            sessions.append(Session(
                id=doc["session_id"],
                user_id=doc["user_id"],
                app_name=app_name,
                state=state
            ))
        return ListSessionsResponse(sessions=sessions)
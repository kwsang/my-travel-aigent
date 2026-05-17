import pytest
import asyncio
import json
from unittest.mock import patch, AsyncMock, MagicMock
from gemini_agent.tools.itinerary_tools import save_itinerary

class DummySession:
    def __init__(self, user_id, session_id):
        self.user_id = user_id
        self.id = session_id

class DummyContext:
    def __init__(self, state):
        self.session = DummySession("test_user", "test_session")
        self.state = state

@pytest.fixture
def mock_db():
    with patch("gemini_agent.tools.itinerary_tools.destinations_collection") as mock_col:
        # Mock the async update_one call on the database collection
        mock_update_result = MagicMock()
        mock_update_result.upserted_id = None
        
        mock_collection = AsyncMock()
        mock_collection.update_one.return_value = mock_update_result
        
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        
        mock_col.database = mock_db
        yield mock_col

def get_valid_dummy_event():
    # Matches the strict Pydantic requirements for Event
    return {
        "day": 1,
        "segment": "LODGING",
        "schedule": {"local_start_time": "2026-05-22T15:00:00"},
        "details": {"name": "Hotel Savannah"}
    }

def test_save_itinerary_bypass_identical(mock_db):
    existing_itinerary = {
        "destination": "Savannah, GA",
        "lodging": {"name": "Hotel Savannah"},
        "events": [get_valid_dummy_event()]
    }
    
    ctx = DummyContext({"final_itinerary": existing_itinerary})
    
    # Call with exactly the same data (using JSON strings to simulate LLM)
    result = asyncio.run(save_itinerary(
        events=json.dumps(existing_itinerary["events"]),
        tool_context=ctx,
        destination="Savannah, GA",
        lodging=json.dumps(existing_itinerary["lodging"]),
    ))
    
    assert "SUCCESS: Itinerary is already up to date" in result
    mock_db.database.__getitem__.return_value.update_one.assert_not_called()

def test_save_itinerary_detects_changes_and_saves(mock_db):
    existing_itinerary = {
        "destination": "Savannah, GA",
        "lodging": {"name": "Hotel Savannah"},
        "events": [get_valid_dummy_event()]
    }
    
    ctx = DummyContext({"final_itinerary": existing_itinerary})
    
    # Change the destination string
    result = asyncio.run(save_itinerary(
        events=json.dumps(existing_itinerary["events"]),
        tool_context=ctx,
        destination="Atlanta, GA", # Changed!
        lodging=json.dumps(existing_itinerary["lodging"]),
    ))
    
    assert "SUCCESS: Draft itinerary updated" in result
    mock_db.database.__getitem__.return_value.update_one.assert_called_once()

if __name__ == "__main__":
    pytest.main([__file__])
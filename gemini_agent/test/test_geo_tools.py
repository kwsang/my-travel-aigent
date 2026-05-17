import pytest
import asyncio
from unittest.mock import patch, MagicMock
from gemini_agent.tools.geo_tools import google_maps_matrix, search_places

class DummySession:
    def __init__(self, state):
        self.state = state

class DummyContext:
    def __init__(self, state):
        self.session = DummySession(state)
        self.state = state

@pytest.fixture
def mock_state():
    return {
        "final_itinerary": {
            "destination": "Savannah, GA"
        },
        "traveler_profile": {
            "preferences": {
                "starting_location": "Duluth, GA"
            }
        }
    }

@patch("gemini_agent.tools.geo_tools.gmaps_client")
def test_google_maps_matrix_anchoring(mock_gmaps, mock_state):
    # Setup mock to avoid hitting the actual Distance Matrix API
    mock_gmaps.distance_matrix.return_value = {"status": "OK"}
    ctx = DummyContext(mock_state)

    # Test 1: Standard anchoring
    asyncio.run(google_maps_matrix(["Hotel"], ["Restaurant"], tool_context=ctx))
    mock_gmaps.distance_matrix.assert_called_with(
        origins=["Hotel in Savannah, GA"],
        destinations=["Restaurant in Savannah, GA"],
        mode="driving",
        departure_time="now"
    )

    # Test 2: Starting location bypass
    asyncio.run(google_maps_matrix(["Duluth, GA"], ["Hotel"], tool_context=ctx))
    mock_gmaps.distance_matrix.assert_called_with(
        origins=["Duluth, GA"],
        destinations=["Hotel in Savannah, GA"],
        mode="driving",
        departure_time="now"
    )

@patch("gemini_agent.tools.geo_tools.gmaps_client")
@patch("gemini_agent.tools.geo_tools.places_client")
def test_search_places_anchoring(mock_places, mock_gmaps, mock_state):
    # Setup mocks to prevent real API calls (both Places and Geocoding)
    mock_places.search_text.return_value = MagicMock(places=[])
    mock_gmaps.geocode.return_value = [{"geometry": {"location": {"lat": 32.08, "lng": -81.09}}}]
    ctx = DummyContext(mock_state)
    
    # Test that the destination is dynamically appended to the text query
    asyncio.run(search_places(query="Seafood restaurants", tool_context=ctx))
    
    # Extract the request payload passed to search_text
    call_args = mock_places.search_text.call_args[1]
    assert call_args["request"]["text_query"] == "Seafood restaurants in Savannah, GA"

if __name__ == "__main__":
    pytest.main([__file__])
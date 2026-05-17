import pytest
import asyncio
import json
from unittest.mock import patch
from gemini_agent.tools.routes import get_route_directions

class DummySession:
    def __init__(self, state):
        self.state = state

class DummyContext:
    def __init__(self, state):
        self.session = DummySession(state)
        self.state = state

@patch("gemini_agent.tools.routes._fetch_route_sync")
def test_get_route_directions_anchoring(mock_fetch):
    # Mock the synchronous fetch function so we don't hit the real API
    mock_fetch.return_value = '{"status": "SUCCESS"}'

    # Setup mock session state with a destination and starting location
    state = {
        "final_itinerary": {
            "destination": "Savannah, GA"
        },
        "traveler_profile": {
            "preferences": {
                "starting_location": "Duluth, GA"
            }
        }
    }
    ctx = DummyContext(state)

    # Test 1: Standard locations (should be anchored to the destination)
    asyncio.run(get_route_directions("Hotel", "Restaurant", tool_context=ctx))
    mock_fetch.assert_called_with("Hotel in Savannah, GA", "Restaurant in Savannah, GA", "DRIVE")

    # Test 2: Origin is starting_location (should bypass anchoring)
    asyncio.run(get_route_directions("Duluth, GA", "Hotel", tool_context=ctx))
    mock_fetch.assert_called_with("Duluth, GA", "Hotel in Savannah, GA", "DRIVE")

    # Test 3: Origin is starting_location, Destination is trip_destination (both bypass)
    asyncio.run(get_route_directions("Duluth, GA", "Savannah, GA", tool_context=ctx))
    mock_fetch.assert_called_with("Duluth, GA", "Savannah, GA", "DRIVE")

    # Test 4: Coordinates (should bypass anchoring)
    asyncio.run(get_route_directions("32.0809,-81.0912", "Hotel", tool_context=ctx))
    mock_fetch.assert_called_with("32.0809,-81.0912", "Hotel in Savannah, GA", "DRIVE")

@patch("gemini_agent.tools.routes._fetch_route_sync")
def test_get_route_directions_token_caching(mock_fetch):
    # Mock the synchronous fetch function to return a valid route with a polyline
    mock_fetch.return_value = json.dumps({
        "status": "SUCCESS",
        "duration": "1000s",
        "distanceMeters": 5000,
        "polyline": "mock_encoded_polyline_data"
    })

    state = {}
    ctx = DummyContext(state)

    # Execute
    result_str = asyncio.run(get_route_directions("Origin", "Destination", tool_context=ctx))
    result = json.loads(result_str)

    # Verify the polyline was stripped and replaced with a token
    assert "polyline" not in result
    assert "route_token" in result
    assert result["route_token"].startswith("route_")

    # Verify the original polyline was safely cached in the state
    assert "_route_cache" in state
    assert state["_route_cache"][result["route_token"]] == "mock_encoded_polyline_data"

@patch("gemini_agent.tools.routes._fetch_route_sync")
def test_get_route_directions_travel_modes(mock_fetch):
    mock_fetch.return_value = '{"status": "SUCCESS"}'
    ctx = DummyContext({})

    # Test WALK mode
    asyncio.run(get_route_directions("A", "B", tool_context=ctx, travel_mode="WALK"))
    mock_fetch.assert_called_with("A", "B", "WALK")

    # Test TRANSIT mode
    asyncio.run(get_route_directions("A", "B", tool_context=ctx, travel_mode="TRANSIT"))
    mock_fetch.assert_called_with("A", "B", "TRANSIT")

if __name__ == "__main__":
    pytest.main([__file__])
import pytest
from gemini_agent.agent_definition import create_travel_agent

class DummySession:
    def __init__(self, state):
        self.state = state

class DummyContext:
    def __init__(self, state):
        self.session = DummySession(state)
        self.state = state

@pytest.fixture
def supervisor_instructions():
    # Instantiate the app to extract the nested supervisor_instructions function
    app = create_travel_agent()
    return app.root_agent.instruction

def test_supervisor_no_profile(supervisor_instructions):
    ctx = DummyContext({})
    result = supervisor_instructions(ctx)
    
    assert "We do not have the user's full travel preferences yet" in result
    assert "Transfer the user to the 'concierge'" in result

def test_supervisor_with_destination_no_events(supervisor_instructions):
    ctx = DummyContext({
        "user_profile_data": {"preferences": {}},
        "final_itinerary": {
            "destination": "Orlando, FL"
        }
    })
    result = supervisor_instructions(ctx)
    
    assert "The user has explicitly selected 'Orlando, FL' as their destination" in result
    assert "Transfer to the 'travel_pioneer'" in result

def test_supervisor_with_events(supervisor_instructions):
    ctx = DummyContext({
        "user_profile_data": {"preferences": {}},
        "final_itinerary": {
            "destination": "Orlando, FL",
            "events": [{"segment": "LODGING"}]
        }
    })
    result = supervisor_instructions(ctx)
    
    assert "A draft itinerary exists in 'final_itinerary'" in result
    assert "Instruct the 'architect' to resume from this version" in result

def test_supervisor_conflict_alert(supervisor_instructions):
    ctx = DummyContext({
        "traveler_profile": {
            "preferences": {"starting_location": "New York, NY"}
        },
        "final_itinerary": {
            "metadata": {"starting_location": "Seattle, WA"},
            "events": [{"segment": "LODGING"}]
        }
    })
    result = supervisor_instructions(ctx)
    
    assert "[CONFLICT ALERT]" in result
    assert "user profile starting location is 'New York, NY'" in result
    assert "draft itinerary starts from 'Seattle, WA'" in result

if __name__ == "__main__":
    pytest.main([__file__])
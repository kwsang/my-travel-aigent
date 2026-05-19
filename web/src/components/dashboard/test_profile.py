import os
import sys
import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

# Add the project root to Python's module search path 
# (Needed because this backend test is located inside the frontend folder)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
sys.path.insert(0, project_root)

from server import app
from api.dependencies import get_db

# Mock MongoDB to run tests instantly without a real database connection
mock_client = AsyncMongoMockClient()
mock_db = mock_client.test_db

# Override the dependency so FastAPI uses the mock database instead of the real one
app.dependency_overrides[get_db] = lambda: mock_db

client = TestClient(app)

def test_update_profile_read_modify_write():
    """
    Tests the profile POST endpoint to ensure nested fields (like preferences)
    are deeply merged and that partial updates do not destroy existing data.
    """
    user_id = "test-user-999"
    
    # 1. Save an initial profile with a starting location
    initial_payload = {
        "party_size": 2,
        "preferences": {
            "starting_location": "Atlanta, GA",
            "activity_density": "high"
        }
    }
    response1 = client.post(f"/profile/{user_id}", json=initial_payload)
    assert response1.status_code == 200
    assert response1.json()["preferences"]["starting_location"] == "Atlanta, GA"
    
    # 2. Send a partial update (e.g., updating the budget, but omitting the location)
    partial_payload = {
        "budget": {"total_limit": 3000, "currency": "USD"},
        "preferences": {
            "activity_density": "low"
        }
    }
    response2 = client.post(f"/profile/{user_id}", json=partial_payload)
    assert response2.status_code == 200
    
    # 3. Verify that the starting location was gracefully preserved by the deep merge
    updated_data = response2.json()
    assert updated_data["budget"]["total_limit"] == 3000
    assert updated_data["preferences"]["activity_density"] == "low" # UPDATED!
    assert updated_data["preferences"]["starting_location"] == "Atlanta, GA" # PRESERVED!
    
import os
import json
import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# New ADK Imports
from google.adk.runners import Runner
from google.adk.agents.llm_agent import LlmAgent

# Import logic from previously validated test scripts
from validate_buffers import calculate_buffer, validate_itinerary_structure, validate_itinerary_budget
from test_maps_integration import get_real_traffic_duration
from test_places_integration import find_place_id, validate_venue_availability

load_dotenv()

def get_schedule(date_str, time_str, duration_mins=None, tz_name="America/New_York"):
    """Helper to generate local and UTC timestamps for an event."""
    tz = ZoneInfo(tz_name)
    local_start = datetime.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=tz)
    res = {
        "local_start_time": local_start.strftime("%Y-%m-%dT%H:%M:%S"),
        "start_time_utc": local_start.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timezone": tz_name
    }
    if duration_mins:
        local_end = local_start + datetime.timedelta(minutes=duration_mins)
        res["local_end_time"] = local_end.strftime("%Y-%m-%dT%H:%M:%S")
        res["end_time_utc"] = local_end.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return res

def evaluate_transport_mode(distance_hours, arrival_time_str):
    """
    Implements Rule 6.1: Driving vs. Flying.
    Proposes driving if < 6 hours and arrival < 12:00 PM.
    """
    arrival_time = datetime.datetime.strptime(arrival_time_str, "%H:%M").time()
    cutoff_time = datetime.time(12, 0)
    
    if distance_hours < 6 and arrival_time <= cutoff_time:
        return "TRANSPORT (Driving)", "Maximize hotel value and save on airfare."
    return "FLIGHT", "Faster arrival for long-distance travel."

async def simulate_adk_agent_run(user_input: str):
    """
    True ADK Simulation: Tests the actual Agent orchestration instead of manual logic.
    """
    print("\n--- Starting ADK Agent Runner Simulation ---")
    # This assumes an 'architect' agent is defined in your package
    runner = Runner(agents_dir="c:/Users/Kang/github/my-travel-aigent/gemini-agent")
    
    # Simulate the start of a session
    session_id = f"sim_{datetime.datetime.now().timestamp()}"
    
    response = await runner.call_agent_async(
        app_name="travel_aigent",
        input_text=user_input,
        session_id=session_id
    )
    
    print(f"Agent Response: {response.text}")
    return response

def simulate_architect_loop():
    """
    Simulates a full-trip lifecycle: Departure, Meals/Activities, and Return.
    """
    print("=== Phase 4: Architect Mission Simulation (Couple Scenario) ===\n")

    # 1. Context: User Profile & Preferences
    # Choice toggles for this simulation
    include_breakfast = False
    prefer_brunch = True 

    # Target start date for simulation
    start_date = datetime.datetime(2024, 7, 1)
    start_date_str = start_date.strftime("%Y-%m-%d")

    user_prefs = {
        "user_id": "user_couple_trip",
        "party_size": {"adults": 2, "children": 0},
        "group_planning_per_person": False,
        "starting_location": "Duluth, GA",
        "target_duration_days": 2,
        "room_sharing": True,
        "people_per_room": 2,  # Default for couples sharing one room
        "circadian_preference": "night_owl",
        "activity_density": "low", # User prefers a relaxed day with few activities
        "risk_tolerance": "relaxed",
        "budget": {"total_limit": 2000, "currency": "USD"}
    }

    duration = user_prefs.get("target_duration_days", 2)
    # Calculate return date (last day)
    end_date = start_date + datetime.timedelta(days=duration - 1)
    return_date_str = end_date.strftime("%Y-%m-%d")

    itinerary_events = []

    # 2. Step 1: Getting There (Logic Evaluation)
    print("Step 1: Evaluating Transport to Savannah, GA...")
    # Evaluating transport from starting location (Duluth, GA) to Savannah, GA (~4 hours)
    mode, reasoning = evaluate_transport_mode(3.5, "11:00")
    print(f"  Proposed Mode: {mode}")
    print(f"  Reasoning: {reasoning}\n")

    travel_duration = 210  # 3.5 hours
    itinerary_events.append({
        "day": 1,
        "segment": "TRANSPORT" if "TRANSPORT" in mode else "FLIGHT",
        "schedule": {**get_schedule(start_date_str, "07:30", travel_duration), "origin": user_prefs["starting_location"]},
        "details": {
            "name": f"Travel to Savannah ({mode})", 
            "is_rental": True if "Driving" in mode else False,
            "price": {"amount": 120.0, "currency": "USD", "is_estimated": True}
        }
    })

    # 3. Step 2: Research & Meal Selection
    print("Step 2: Selecting Meal Options...")
    meal_candidates = {
        "Breakfast": {"name": "Two Cracked Eggs Cafe", "start": "08:30", "price": 40.0},
        "Brunch": {"name": "The Collins Quarter", "start": "11:30", "price": 80.0},
        "Lunch": {"name": "Mrs. Wilkes' Dining Room", "start": "13:00", "price": 70.0},
        "Dinner": {"name": "The Olde Pink House", "start": "20:30", "price": 180.0} # Required
    }

    # 3.1 Experience Research (Day 1 vs Day 2)
    print("Step 2.1: Researching Activities...")
    experience_pool = [
        {"name": "Bonaventure Cemetery Tour", "day": 1, "start": "13:30", "duration": 120, "price": 35.0, "category": "Sightseeing"},
        {"name": "SCAD Museum of Art", "day": 1, "start": "16:00", "duration": 90, "price": 20.0, "category": "Museum"},
        {"name": "Morning Swim at Hotel", "day": 2, "start": "10:00", "duration": 60, "price": 0.0, "category": "Water/Pool"},
        {"name": "River Street Stroll", "day": 2, "start": "13:00", "duration": 60, "price": 0.0, "category": "Leisure"}
    ]
    
    # Day 1 Logic: Normal Planning
    day_1_activities = [e for e in experience_pool if e["day"] == 1]
    
    # Day 2 Logic: "Light" Activities only (Water/mess allowed ONLY before checkout)
    checkout_time_str = "11:00"
    print(f"  Filtering last-day activities (Water/Pool allowed only before checkout at {checkout_time_str})...")
    day_2_activities = [
        e for e in experience_pool 
        if e["day"] == 2 and (e["category"] not in ["Water/Pool", "Active/Sports"] or e["start"] < checkout_time_str)
    ]

    # Constructing Event Selection for Simulation
    # Include the mandatory retreat block for Relaxed risk tolerance
    retreat_block = {"name": "The Gastonian (Retreat)", "start": "18:00", "duration": 135, "price": 0.0, "category": "Retreat", "segment": "ACCOMMODATION"}
    selected_day_1 = [meal_candidates["Brunch"]] + day_1_activities + [retreat_block] + [meal_candidates["Dinner"]]
    selected_day_2 = day_2_activities

    # 4. Logistical Validation Loop
    print("\nStep 2: Starting Logistical Validation Loop...")
    # Add initial check-in/luggage drop-off block
    stay_nights = duration - 1
    total_stay_mins = (stay_nights * 24 * 60) # From Day 1 11:00 to Day 2 11:00
    itinerary_events.append({
        "day": 1,
        "segment": "ACCOMMODATION",
        "schedule": get_schedule(start_date_str, "11:00", total_stay_mins),
        "details": {
            "name": "The Gastonian (Stay)", 
            "city": "Savannah, GA", 
            "category": "Stay", 
            "price": {"amount": 400.0 * (duration - 1), "currency": "USD", "is_estimated": True}
        }
    })

    # Process Day 1 & Day 2
    for day_num, day_list in [(1, selected_day_1), (2, selected_day_2)]:
        curr_date = start_date_str if day_num == 1 else return_date_str
        for event_candidate in day_list:
            print(f"  Validating {event_candidate['name']} ({event_candidate['start']})...")
            
            # Skip external API validation for mock accommodation segments
            if event_candidate.get("segment") == "ACCOMMODATION":
                venue_data = True
            else:
                place_id = find_place_id(f"{event_candidate['name']}, Savannah, GA")
                venue_data = validate_venue_availability(place_id, event_candidate["start"], min_rating=4.5)
            
            if venue_data:
                traffic_mins = get_real_traffic_duration("32.0761,-81.0951", "32.0781,-81.0912")
                if traffic_mins is not None:
                    buffer = calculate_buffer(traffic_mins, event_candidate["start"], user_prefs["risk_tolerance"])
                    duration_mins = event_candidate.get("duration", 90)

                    segment_type = event_candidate.get("segment")
                    if not segment_type:
                        segment_type = "DINING" if event_candidate.get("category") in ["Brunch", "Lunch", "Dinner"] else "EXPERIENCE"

                    itinerary_events.append({
                        "day": day_num,
                        "segment": segment_type,
                        "schedule": {
                            **get_schedule(curr_date, event_candidate["start"], duration_mins),
                            "commute_metadata": {
                                "estimated_traffic_minutes": traffic_mins,
                                "applied_buffer_minutes": buffer
                            }
                        },
                        "details": {
                            "name": event_candidate["name"],
                            "category": event_candidate.get("category", "General"),
                            "city": "Savannah, GA",
                            "price": {"amount": event_candidate["price"], "currency": "USD", "is_estimated": True}
                        }
                    })

    # 5. Step 3: Getting Back
    print("\nStep 3: Planning Return Trip with Rental Return Buffer...")
    itinerary_events.append({
        "day": duration,
        "segment": "LOGISTICS",
        "schedule": get_schedule(return_date_str, "15:15", 45),
        "details": {
            "name": "Car Rental Return", 
            "category": "Transport Logistics",
            "price": {"amount": 0.0, "currency": "USD", "is_estimated": False}
        }
    })

    itinerary_events.append({
        "day": duration,
        "segment": "TRANSPORT",
        "schedule": get_schedule(return_date_str, "16:00", 240), # 4 hour return drive
        "details": {
            "name": "Return Journey",
            "price": {"amount": 50.0, "currency": "USD", "is_estimated": True}
        }
    })

    # 6. Persistence & Final Validation
    mock_itinerary = {
        "user_id": user_prefs["user_id"],
        "trip_name": "Full Trip Simulation",
        "duration_days": duration,
        "party_size_total": 2,
        "events": sorted(itinerary_events, key=lambda x: x["schedule"]["local_start_time"])
    }

    print("\nStep 4: Final Structural & Budget Validation...")
    validate_itinerary_structure(mock_itinerary, user_prefs["risk_tolerance"], user_prefs["circadian_preference"], user_prefs)
    validate_itinerary_budget(mock_itinerary, user_prefs)

    print("\n=== Simulation Complete ===")
    print(f"Final Itinerary includes {len(mock_itinerary['events'])} segments.")

if __name__ == "__main__":
    # Ensure API keys are present
    if not os.environ.get("GOOGLE_MAPS_API_KEY") or not os.environ.get("VOYAGE_API_KEY"):
        print("Please ensure GOOGLE_MAPS_API_KEY and VOYAGE_API_KEY are set in .env")
    else:
        simulate_architect_loop()
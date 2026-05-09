import datetime
import math

def calculate_buffer(traffic_estimate: int, local_time_str: str, risk_tolerance: str) -> int:
    """
    Calculates the expected buffer based on traffic estimate, local time, and risk tolerance.
    
    Args:
        traffic_estimate (int): Estimated traffic duration in minutes.
        local_time_str (str): Local time in HH:MM format (e.g., "12:00").
        risk_tolerance (str): User's risk tolerance ("strict" or "relaxed").
        
    Returns:
        int: The calculated buffer in minutes.
    """
    
    # Parse local time to check for peak hours
    local_time = datetime.datetime.strptime(local_time_str, "%H:%M").time()
    
    # Peak hour definition from DATA_MODEL.md
    peak_hour_start_morning = datetime.time(7, 30)
    peak_hour_end_morning = datetime.time(9, 30)
    peak_hour_start_evening = datetime.time(16, 30)
    peak_hour_end_evening = datetime.time(18, 30)
    
    is_peak_hour = (peak_hour_start_morning <= local_time <= peak_hour_end_morning) or \
                   (peak_hour_start_evening <= local_time <= peak_hour_end_evening)
                   
    # Determine multiplier M
    M = 1.5 if is_peak_hour else 1.2
    
    # Calculate Base Buffer ($B_{base}$)
    b_base = int((traffic_estimate * M) + 10)
    
    # Apply risk tolerance specific rules
    if risk_tolerance.lower() == "strict":
        # Strict Buffer: max($B_{base}$, 20 mins)
        return max(b_base, 20)
    elif risk_tolerance.lower() == "relaxed":
        # Relaxed Buffer: max($B_{base}$ + 15 mins, 40 mins)
        return max(b_base + 15, 40)
    else:
        raise ValueError("Invalid risk_tolerance. Must be 'strict' or 'relaxed'.")

def validate_itinerary_structure(itinerary: dict, risk_tolerance: str, circadian_pref: str, user_prefs: dict = None):
    """
    Validates the high-level structure of an itinerary based on Scenario 5 requirements:
    Clustering, Night Owl hours, and the Retreat Rule.
    """
    print(f"Validating Itinerary Structure (Risk: {risk_tolerance}, Vibe: {circadian_pref})...")
    errors = []
    
    events = itinerary.get("events", [])
    # Determine total group size for logistics checks
    # Note: In a real scenario, this would come from the user profile context passed to the validator
    events_by_day = {}
    
    for event in events:
        dt = datetime.datetime.fromisoformat(event["schedule"]["local_start_time"])
        day = dt.date()
        if day not in events_by_day:
            events_by_day[day] = []
        events_by_day[day].append(event)

    # 1. Multi-day check for Relaxed
    if risk_tolerance.lower() == "relaxed" and len(events_by_day) < 2:
        errors.append("FAIL: Relaxed itineraries with many activities should be split across multiple days.")

    for day, day_events in events_by_day.items():
        # 2. Night Owl Check
        if circadian_pref.lower() == "night_owl":
            first_event_dt = datetime.datetime.fromisoformat(day_events[0]["schedule"]["local_start_time"])
            if first_event_dt.hour < 10:
                errors.append(f"FAIL: Night Owl violation on {day}. First activity starts at {first_event_dt.time()}.")

            # Night Owl Dinner Window: 20:00 - 23:00
            dinner_event = next((e for e in day_events if e["segment"] == "DINING" and e["details"].get("category") == "Dinner"), None)
            if dinner_event:
                dinner_time = datetime.datetime.fromisoformat(dinner_event["schedule"]["local_start_time"]).time()
                if not (datetime.time(20, 0) <= dinner_time <= datetime.time(23, 0)):
                    errors.append(f"FAIL: Night Owl dinner violation on {day}. Dinner at {dinner_time} (expected 20:00-23:00).")

        # 3. Location Clustering Check (Relaxed)
        if risk_tolerance.lower() == "relaxed":
            # Clustering refers to the city or travel zone, not individual venues
            zones = {e["details"].get("city") or e["details"].get("travel_zone") 
                     for e in day_events if "city" in e["details"] or "travel_zone" in e["details"]}
            if len(zones) > 1:
                errors.append(f"FAIL: Clustering violation on {day}. Found multiple zones: {zones}")

        # 4. The "Retreat" Rule Check (Relaxed)
        if risk_tolerance.lower() == "relaxed":
            dinner_idx = next((i for i, e in enumerate(day_events) 
                             if e["segment"] == "DINING" and e["details"].get("category") == "Dinner"), -1)
            
            if dinner_idx > 0:
                dinner_start = datetime.datetime.fromisoformat(day_events[dinner_idx]["schedule"]["local_start_time"])
                
                # Check for an explicit accommodation retreat or a 2+ hour gap from the last activity's end
                prev_event = day_events[dinner_idx-1]
                is_retreat = prev_event["segment"] == "ACCOMMODATION"
                
                # Fallback to start_time if end_time isn't present, though end_time is preferred for gap logic
                prev_end_str = prev_event["schedule"].get("local_end_time") or prev_event["schedule"]["local_start_time"]
                prev_end = datetime.datetime.fromisoformat(prev_end_str)
                
                gap = (dinner_start - prev_end).total_seconds() / 3600
                
                if gap < 2.0 and not is_retreat:
                    errors.append(f"FAIL: Retreat Rule violation on {day}. Only {gap:.1f}h gap and no accommodation block.")

        # 5. Transport Logic Check (Preference & Necessity)
        if user_prefs and user_prefs.get("personal_transport_available") is True:
            rentals = [e for e in day_events if e["segment"] == "TRANSPORT" and e["details"].get("is_rental") is True]
            if rentals:
                errors.append(f"FAIL: Rental car suggested on {day} despite personal transport being available.")

        # 5. Large Group Transport Check (Rule 6 in SYSTEM_PROMPT.md)
        for event in day_events:
            if event["segment"] == "TRANSPORT":
                vehicle_count = event["details"].get("vehicle_count", 1)
                # We assume a standard vehicle holds ~5 people. Rule 6 says 6+ needs multiple.
                if (itinerary.get("party_size_total", 0) >= 6) and vehicle_count < 2:
                    errors.append(f"FAIL: Transport logistics violation on {day}. Party size >= 6 requires multiple vehicles.")

    if not errors:
        print("  Result: PASS - Structure adheres to clustering and temporal rules.\n")
    else:
        for err in errors:
            print(f"  {err}")
        print("")

def validate_itinerary_budget(itinerary: dict, user_prefs: dict):
    """
    Validates budget adherence based on group size, per-person toggle, and room sharing.
    """
    print(f"Validating Budget (Group Size: {user_prefs['party_size']['adults']}, Per-Person: {user_prefs['group_planning_per_person']})...")
    
    adults = user_prefs['party_size']['adults']
    children = user_prefs['party_size']['children']
    total_people = adults + children
    total_cost = 0.0
    limit = user_prefs['budget']['total_limit']
    per_person_toggle = user_prefs.get('group_planning_per_person', False)
    room_sharing = user_prefs.get('room_sharing', False)
    people_per_room = user_prefs.get('people_per_room', 2)

    # Validate people_per_room
    if not isinstance(people_per_room, int) or people_per_room <= 0:
        print(f"  FAIL: Invalid 'people_per_room' value. Must be a positive integer. Found: {people_per_room}\n")
        return False


    for event in itinerary.get("events", []):
        price_data = event["details"].get("price", {})
        base_amt = price_data.get("amount", 0.0)
        
        if event["segment"] == "ACCOMMODATION":
            if room_sharing:
                # Account for specific room density
                num_rooms = math.ceil(total_people / people_per_room)
                total_cost += (base_amt * num_rooms)
            else:
                # No sharing: one room per person
                total_cost += (base_amt * total_people)
        elif event["segment"] == "DINING":
            # Apply 50% child pricing rule (Rule 4 in SYSTEM_PROMPT.md)
            total_cost += (base_amt * adults) + (base_amt * 0.5 * children)
        elif event["segment"] == "TRANSPORT":
            # Transport is priced per vehicle, not per person
            v_count = event["details"].get("vehicle_count", 1)
            total_cost += (base_amt * v_count)
        else:
            # Experience/Logistics usually full price per head
            total_cost += (base_amt * total_people)

    final_val = total_cost / total_people if per_person_toggle else total_cost
    
    currency = user_prefs['budget'].get('currency', 'USD')
    print(f"  Calculated Value: {final_val:.2f} {currency}")
    print(f"  Budget Limit:     {limit:.2f} {currency}")

    if final_val > limit:
        print(f"  FAIL: Budget exceeded. {final_val:.2f} > {limit:.2f}\n")
        return False
    elif final_val > (limit * 0.9):
        print(f"  WARNING: Budget threshold (90%) reached ({final_val:.2f} / {limit:.2f}).")
    
    print("  Result: PASS - Budget is within limits.\n")
    return True

def run_buffer_test_suite():
    """
    Runs the buffer test suite scenarios and validates the calculated buffers.
    """
    print("Running Buffer Test Suite...\n")
    
    scenarios = [
        {
            "name": "Scenario 1: The Short Hop (Non-Peak)",
            "traffic_estimate": 5,
            "local_time": "12:00",
            "expected": {
                "strict": 20,
                "relaxed": 40
            }
        },
        {
            "name": "Scenario 2: Standard City Commute (Non-Peak)",
            "traffic_estimate": 25,
            "local_time": "14:30",
            "expected": {
                "strict": 40,
                "relaxed": 55
            }
        },
        {
            "name": "Scenario 3: Rush Hour Risk",
            "traffic_estimate": 20,
            "local_time": "17:30", # Peak Window
            "expected": {
                "strict": 40,
                "relaxed": 55
            }
        },
        {
            "name": "Scenario 4: Long Distance Transition",
            "traffic_estimate": 50,
            "local_time": "10:00",
            "expected": {
                "strict": 70,
                "relaxed": 85
            }
        }
    ]
    
    for i, scenario in enumerate(scenarios):
        print(f"--- {scenario['name']} ---")
        traffic = scenario['traffic_estimate']
        time = scenario['local_time']
        
        for risk_type, expected_buffer in scenario['expected'].items():
            calculated_buffer = calculate_buffer(traffic, time, risk_type)
            
            status = "PASS" if calculated_buffer == expected_buffer else "FAIL"
            print(f"  User Profile: {risk_type.capitalize()}")
            print(f"    Traffic Estimate: {traffic} mins, Local Time: {time}")
            print(f"    Calculated Buffer: {calculated_buffer} mins")
            print(f"    Expected Buffer:   {expected_buffer} mins")
            print(f"    Result: {status}\n")
            
            if status == "FAIL":
                print(f"  !!! Test Failed for {scenario['name']} ({risk_type.capitalize()}) !!!")
                # Optionally, you could raise an exception here to stop on first failure
                
    print("Buffer Test Suite Finished.")

def run_scenario_5_validation():
    """
    Runs the validation for Scenario 5: Multi-Location Relaxed Night Owl (Bachelor Party).
    """
    print("Running Scenario 5: Multi-Location Relaxed Night Owl (Bachelor Party) Validation...\n")

    mock_itinerary_scenario_5 = {
        "user_id": "user_bachelor_party",
        "trip_name": "Bachelor Party Amalfi Coast",
        "duration_days": 2,
        "party_size_total": 12,
        "status": "draft",
        "events": [
            # Day 1: Positano Hub
            {
                "segment": "DINING",
                "schedule": {
                    "local_start_time": "2024-07-01T11:00:00",
                    "local_end_time": "2024-07-01T12:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Positano Brunch Spot",
                    "category": "Brunch",
                    "city": "Positano"
                }
            },
            {
                "segment": "EXPERIENCE",
                "schedule": {
                    "local_start_time": "2024-07-01T13:00:00",
                    "local_end_time": "2024-07-01T16:00:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Private Boat Tour",
                    "category": "Nautical",
                    "city": "Positano"
                }
            },
            {
                "segment": "EXPERIENCE",
                "schedule": {
                    "local_start_time": "2024-07-01T16:30:00",
                    "local_end_time": "2024-07-01T18:00:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Arienzo Beach Club",
                    "category": "Beach",
                    "city": "Positano"
                }
            },
            {
                "segment": "ACCOMMODATION", # Explicit retreat
                "schedule": {
                    "local_start_time": "2024-07-01T18:00:00",
                    "local_end_time": "2024-07-01T20:00:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Hotel Positano",
                    "category": "Retreat",
                    "city": "Positano"
                }
            },
            {
                "segment": "DINING",
                "schedule": {
                    "local_start_time": "2024-07-01T20:30:00",
                    "local_end_time": "2024-07-01T22:00:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Gourmet Dinner Positano",
                    "category": "Dinner",
                    "city": "Positano"
                }
            },
            {
                "segment": "EXPERIENCE",
                "schedule": {
                    "local_start_time": "2024-07-01T22:30:00",
                    "local_end_time": "2024-07-02T01:00:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Positano Nightclub",
                    "category": "Nightlife",
                    "city": "Positano"
                }
            },
            # Day 2: Amalfi Hub
            {
                "segment": "DINING",
                "schedule": {
                    "local_start_time": "2024-07-02T12:00:00",
                    "local_end_time": "2024-07-02T13:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Amalfi Group Lunch",
                    "category": "Lunch",
                    "city": "Amalfi"
                }
            },
            {
                "segment": "EXPERIENCE",
                "schedule": {
                    "local_start_time": "2024-07-02T14:30:00",
                    "local_end_time": "2024-07-02T15:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Amalfi Cathedral Visit",
                    "category": "Sightseeing",
                    "city": "Amalfi"
                }
            },
            {
                "segment": "EXPERIENCE",
                "schedule": {
                    "local_start_time": "2024-07-02T16:00:00",
                    "local_end_time": "2024-07-02T17:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Paper Museum",
                    "category": "Museum",
                    "city": "Amalfi"
                }
            },
            {
                "segment": "ACCOMMODATION", # Explicit retreat
                "schedule": {
                    "local_start_time": "2024-07-02T17:30:00",
                    "local_end_time": "2024-07-02T20:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Hotel Amalfi",
                    "category": "Retreat",
                    "city": "Amalfi"
                }
            },
            {
                "segment": "DINING",
                "schedule": {
                    "local_start_time": "2024-07-02T21:00:00",
                    "local_end_time": "2024-07-02T22:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Seafood Dinner Amalfi",
                    "category": "Dinner",
                    "city": "Amalfi"
                }
            },
            {
                "segment": "EXPERIENCE",
                "schedule": {
                    "local_start_time": "2024-07-02T23:00:00",
                    "local_end_time": "2024-07-03T01:30:00",
                    "timezone": "Europe/Rome"
                },
                "details": {
                    "name": "Amalfi Bar Crawl",
                    "category": "Nightlife",
                    "city": "Amalfi"
                }
            }
        ]
    }

    user_prefs = {
        "party_size": {"adults": 12, "children": 0},
        "group_planning_per_person": True,
        "room_sharing": True,
        "people_per_room": 3,
        "transport_preference": "rideshare",
        "personal_transport_available": False,
        "budget": {
            "total_limit": 1500, # 1500 per person
            "currency": "USD"
        }
    }

    # Mock adding prices for the validation
    for event in mock_itinerary_scenario_5["events"]:
        event["details"]["price"] = {"amount": 100.0, "currency": "USD"}

    validate_itinerary_budget(mock_itinerary_scenario_5, user_prefs)
    validate_itinerary_structure(mock_itinerary_scenario_5, "relaxed", "night_owl", user_prefs)

if __name__ == "__main__":
    run_buffer_test_suite()
    run_scenario_5_validation()

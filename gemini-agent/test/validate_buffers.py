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

def to_utc_aware(ts):
    """Helper to ensure timestamps are offset-aware UTC for comparison."""
    dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt.replace(tzinfo=datetime.timezone.utc) if dt.tzinfo is None else dt

def check_event_overlap(current_event: dict, next_event: dict):
    """
    Determines if two events overlap. 
    Special Case: Accommodation 'Stay' events are treated as point-in-time check-ins 
    to allow other activities during the stay.
    """
    # 1. Determine End Time of Current Event
    # If it's a 'Stay', we treat the 'end' as 30 mins after start for overlap purposes.
    # This prevents the hotel stay from 'blocking' the rest of the trip.
    if current_event["segment"] == "ACCOMMODATION" and "Stay" in current_event["details"].get("name", ""):
        current_start = to_utc_aware(current_event["schedule"].get("start_time_utc") or 
                                     current_event["schedule"]["local_start_time"])
        current_end = current_start + datetime.timedelta(minutes=30)
    else:
        current_end = to_utc_aware(current_event["schedule"].get("end_time_utc") or 
                                   current_event["schedule"].get("local_end_time") or 
                                   current_event["schedule"].get("start_time_utc") or 
                                   current_event["schedule"]["local_start_time"])

    # 2. Determine Start Time of Next Event
    next_start = to_utc_aware(next_event["schedule"].get("start_time_utc") or 
                              next_event["schedule"]["local_start_time"])

    # 3. Check for Collision
    if current_end > next_start:
        # Calculate the collision duration for a better error message
        overlap_delta = (current_end - next_start).total_seconds() / 60
        return True, overlap_delta
    
    return False, 0

def validate_itinerary_structure(itinerary: dict, risk_tolerance: str, circadian_pref: str, user_prefs: dict = None):
    """
    Validates the high-level structure of an itinerary based on Scenario 5 requirements:
    Clustering, Night Owl hours, and the Retreat Rule.
    """
    print(f"Validating Itinerary Structure (Risk: {risk_tolerance}, Vibe: {circadian_pref})...")
    errors = []
    
    events = itinerary.get("events", [])
    if not events:
        return True

    # Establish the trip's start date to verify the 'day' property increments correctly
    start_date = min(datetime.datetime.fromisoformat(e["schedule"]["local_start_time"]).date() for e in events)

    # Determine if a rental is used at any point for Rule 6.5
    uses_rental = any(e["details"].get("is_rental") is True for e in events)

    events_by_day = {}
    for event in events:
        current_dt = datetime.datetime.fromisoformat(event["schedule"]["local_start_time"]).date()
        expected_day = (current_dt - start_date).days + 1
        day = event.get("day")

        if day is not None:
            if day != expected_day:
                errors.append(f"FAIL: Day index mismatch for '{event['details'].get('name', 'Unknown')}'. "
                              f"Date {current_dt} corresponds to Day {expected_day}, but 'day' property is {day}.")
        
        day = expected_day # Force normalized integer day for grouping
        if day not in events_by_day:
            events_by_day[day] = []
        events_by_day[day].append(event)

    # Get sorted days for global sequencing checks
    sorted_days = sorted(events_by_day.keys())
    last_day_idx = sorted_days[-1] if sorted_days else 0

    # 1. Multi-day check for Relaxed
    if risk_tolerance.lower() == "relaxed" and len(events_by_day) < 2:
        errors.append("FAIL: Relaxed itineraries with many activities should be split across multiple days.")

    for day, day_events in events_by_day.items():
        # Ensure chronological order for sequence-based checks
        # Use UTC for sorting to accurately handle timezone transitions
        day_events.sort(key=lambda x: to_utc_aware(x["schedule"].get("start_time_utc") or 
                                                  x["schedule"].get("local_start_time") or 
                                                  # Fallback for events missing specific keys
                                                  "1970-01-01T00:00:00Z"))

        # 1.5 Overlap Check
        for i in range(len(day_events) - 1):
            current_event = day_events[i]
            next_event = day_events[i+1]
            
            is_overlapping, minutes = check_event_overlap(current_event, next_event)
            if is_overlapping:
                errors.append(
                    f"FAIL: Overlap on {day}. '{current_event['details'].get('name')}' overlaps with "
                    f"'{next_event['details'].get('name')}' by {minutes:.0f} minutes."
                )

        # 2. Night Owl Check
        if circadian_pref.lower() == "night_owl":
            # Night Owls avoid non-essential segments before 10:00 AM. 
            # Logistical transitions (TRANSPORT/FLIGHT) are considered essential and excluded from this check.
            activities = [e for e in day_events if e["segment"] not in ["TRANSPORT", "FLIGHT"]]
            if activities:
                first_activity_dt = datetime.datetime.fromisoformat(activities[0]["schedule"]["local_start_time"])
                if first_activity_dt.hour < 10:
                    errors.append(f"FAIL: Night Owl violation on {day}. First activity starts at {first_activity_dt.time()}.")

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
                # Check for an explicit accommodation retreat or a 2+ hour gap from the last activity's end
                prev_event = day_events[dinner_idx-1]
                is_retreat = prev_event["segment"] == "ACCOMMODATION"
                
                # Physical duration gap calculation using UTC aware datetimes
                dinner_start_utc = to_utc_aware(day_events[dinner_idx]["schedule"].get("start_time_utc") or 
                                                day_events[dinner_idx]["schedule"]["local_start_time"])
                prev_end = to_utc_aware(prev_event["schedule"].get("end_time_utc") or 
                                        prev_event["schedule"].get("local_end_time") or 
                                        prev_event["schedule"].get("start_time_utc") or 
                                        prev_event["schedule"]["local_start_time"])
                
                gap = (dinner_start_utc - prev_end).total_seconds() / 3600
                
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

        # 5.5 Transit Realism (Rule 11)
        for i in range(len(day_events) - 1):
            if day_events[i]["segment"] == "FLIGHT":
                arrival_dt = to_utc_aware(day_events[i]["schedule"].get("end_time_utc") or day_events[i]["schedule"].get("local_end_time"))
                if arrival_dt.hour >= 22:
                    next_ev = day_events[i+1]
                    # Skip transport to hotel check
                    if next_ev["segment"] == "TRANSPORT" and i + 2 < len(day_events):
                        next_ev = day_events[i+2]
                    if next_ev["segment"] not in ["ACCOMMODATION", "TRANSPORT"]:
                        errors.append(f"FAIL: Transit realism on day {day}. Late flight arrival ({arrival_dt.time()}) must be followed by ACCOMMODATION.")

        # 6. Last Day Constraints (Water/Pool Rule)
        if day == last_day_idx:
            # Find checkout time (end of accommodation) that falls on this day
            checkout_time = None
            for e in events:
                e_end_dt = datetime.datetime.fromisoformat(e["schedule"].get("local_end_time") or e["schedule"]["local_start_time"])
                e_end_day = (e_end_dt.date() - start_date).days + 1
                
                # Check if this accommodation ends on the current day we are validating
                if e["segment"] == "ACCOMMODATION" and e_end_day == day:
                    checkout_time = e_end_dt
                    break
            
            if checkout_time:
                for event in day_events:
                    if event["details"].get("category") in ["Water/Pool", "Active/Sports"]:
                        event_start = datetime.datetime.fromisoformat(event["schedule"]["local_start_time"])
                        if event_start >= checkout_time:
                            errors.append(f"FAIL: Last day constraint violation on {day}. "
                                          f"'{event['details'].get('name')}' (Water/Active) scheduled after checkout ({checkout_time.time()}).")

            # 7. Rental Return Check (Rule 6.5)
            if uses_rental:
                final_transport_idx = -1
                for idx, e in enumerate(day_events):
                    if e["segment"] in ["TRANSPORT", "FLIGHT"] and "Return" in e["details"].get("name", ""):
                        final_transport_idx = idx
                        break
                
                if final_transport_idx > 0:
                    prev_event = day_events[final_transport_idx - 1]
                    is_return_logistics = prev_event["segment"] == "LOGISTICS" and "Rental Return" in prev_event["details"].get("name", "")
                    if not is_return_logistics:
                        errors.append(f"FAIL: Missing mandatory 'Car Rental Return' logistics segment before return journey on day {day}.")
                    else:
                        # Verify 45m duration
                        l_start = to_utc_aware(prev_event["schedule"].get("start_time_utc") or prev_event["schedule"]["local_start_time"])
                        l_end = to_utc_aware(prev_event["schedule"].get("end_time_utc") or prev_event["schedule"].get("local_end_time") or prev_event["schedule"]["local_start_time"])
                        if (l_end - l_start).total_seconds() < 2700:
                             errors.append(f"FAIL: Rental return buffer too short on day {day}. Found {(l_end - l_start).total_seconds()/60:.0f}m, expected 45m.")

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

    errors = []

    # Validate people_per_room
    if not isinstance(people_per_room, int) or people_per_room <= 0:
        print(f"  FAIL: Invalid 'people_per_room' value. Must be a positive integer. Found: {people_per_room}\n")
        return False

    for event in itinerary.get("events", []):
        price_data = event["details"].get("price", {})
        if price_data:
            # Ensure 'is_estimated' flag is correctly set
            if "is_estimated" not in price_data or not isinstance(price_data["is_estimated"], bool):
                errors.append(f"FAIL: 'is_estimated' flag missing or invalid in price object for '{event['details'].get('name', 'Unknown')}'.")

        base_amt = price_data.get("amount", 0.0)
        
        if event["segment"] == "ACCOMMODATION":
            if room_sharing:
                # Account for specific room density (e.g., 2 people/1 room for couples)
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

    if errors:
        for err in errors:
            print(f"  {err}")
        return False

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
        event["details"]["price"] = {"amount": 100.0, "currency": "USD", "is_estimated": True}

    validate_itinerary_budget(mock_itinerary_scenario_5, user_prefs)
    validate_itinerary_structure(mock_itinerary_scenario_5, "relaxed", "night_owl", user_prefs)

if __name__ == "__main__":
    run_buffer_test_suite()
    run_scenario_5_validation()

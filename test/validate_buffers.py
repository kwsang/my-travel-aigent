import datetime

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

def validate_itinerary_structure(itinerary: dict, risk_tolerance: str, circadian_pref: str):
    """
    Validates the high-level structure of an itinerary based on Scenario 5 requirements:
    Clustering, Night Owl hours, and the Retreat Rule.
    """
    print(f"Validating Itinerary Structure (Risk: {risk_tolerance}, Vibe: {circadian_pref})...")
    errors = []
    
    events = itinerary.get("events", [])
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

        # 3. Location Clustering Check (Relaxed)
        if risk_tolerance.lower() == "relaxed":
            locations = {e["details"].get("location") for e in day_events if "location" in e["details"]}
            if len(locations) > 1:
                errors.append(f"FAIL: Clustering violation on {day}. Found multiple locations: {locations}")

        # 4. The "Retreat" Rule Check (Relaxed)
        if risk_tolerance.lower() == "relaxed":
            # Find dinner index
            dinner_idx = next((i for i, e in enumerate(day_events) 
                             if e["segment"] == "DINING" and e["details"].get("category") == "Dinner"), -1)
            
            if dinner_idx > 0:
                dinner_start = datetime.datetime.fromisoformat(day_events[dinner_idx]["schedule"]["local_start_time"])
                # Check if the event immediately preceding dinner is an ACCOMMODATION or if there is a significant time gap
                # For the sake of this validation, we check for a 2+ hour gap before dinner start
                prev_event_end = datetime.datetime.fromisoformat(day_events[dinner_idx-1]["schedule"]["local_start_time"])
                # Note: In a real scenario, we'd use end_time_utc, but here we estimate from start times
                gap = (dinner_start - prev_event_end).total_seconds() / 3600
                
                if gap < 2.0:
                    errors.append(f"FAIL: Retreat Rule violation on {day}. Only {gap}h gap before dinner.")

    if not errors:
        print("  Result: PASS - Structure adheres to clustering and temporal rules.\n")
    else:
        for err in errors:
            print(f"  {err}")
        print("")

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

if __name__ == "__main__":
    run_buffer_test_suite()

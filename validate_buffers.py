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
from typing import Any
import logging
from gemini_agent.clients import gmaps_client

logger = logging.getLogger(__name__)

def calculate_travel_time(origin: Any, destination: Any) -> tuple[int, float, str]:
    """Helper to calculate travel duration, distance in miles, and mode (walking/driving)."""
    try:
        # Handle dict coordinates or raw address strings
        orig = f"{origin['latitude']},{origin['longitude']}" if isinstance(origin, dict) else origin
        dest = f"{destination['latitude']},{destination['longitude']}" if isinstance(destination, dict) else destination

        # 1. Driving check to get initial distance and traffic duration
        matrix = gmaps_client.distance_matrix(origins=[orig], destinations=[dest], mode="driving", departure_time="now")
        if matrix['status'] == 'OK':
            element = matrix['rows'][0]['elements'][0]
            if element['status'] == 'OK':
                distance_meters = element['distance']['value']
                distance_miles = distance_meters * 0.000621371
                
                # 2. Walking logic: if < 0.5 miles, fetch walking duration
                if distance_miles < 0.5:
                    walking_matrix = gmaps_client.distance_matrix(origins=[orig], destinations=[dest], mode="walking")
                    if walking_matrix['status'] == 'OK':
                        w_element = walking_matrix['rows'][0]['elements'][0]
                        if w_element['status'] == 'OK':
                            return w_element['duration']['value'] // 60, distance_miles, "walking"
                
                # 3. Default to driving results
                duration_mins = element['duration_in_traffic']['value'] // 60
                return duration_mins, distance_miles, "driving"
    except Exception as e:
        logger.error(f"Failed to calculate travel time from {origin} to {destination}: {e}")
    return 0, 0.0, "unknown"
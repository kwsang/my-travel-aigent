import os
import googlemaps
import logging

logger = logging.getLogger(__name__)

def calculate_travel_time(origin_geo: str, dest_geo: str, mode: str = "driving"):
    """
    Helper to calculate travel time and distance between two points using Google Maps.
    Used by the LogisticsMonitorPlugin to detect proximity violations.
    Returns: (minutes, miles, mode)
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        logger.warning("calculate_travel_time: GOOGLE_MAPS_API_KEY not set.")
        return 0, 0, "unknown"

    try:
        gmaps = googlemaps.Client(key=api_key)
        # Call Distance Matrix to get duration with traffic
        matrix = gmaps.distance_matrix(
            origins=[origin_geo],
            destinations=[dest_geo],
            mode=mode,
            departure_time="now"
        )

        if matrix["status"] == "OK":
            element = matrix["rows"][0]["elements"][0]
            if element["status"] == "OK":
                # Extract duration (prefer duration_in_traffic) and distance
                duration_secs = element.get("duration_in_traffic", element["duration"])["value"]
                distance_meters = element["distance"]["value"]
                
                minutes = round(duration_secs / 60)
                miles = distance_meters * 0.000621371 # Convert meters to miles
                
                return minutes, miles, mode

        return 0, 0, "unknown"
    except Exception as e:
        logger.error(f"calculate_travel_time error: {e}")
        return 0, 0, "unknown"
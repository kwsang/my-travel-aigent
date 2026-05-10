import os
import googlemaps
from datetime import datetime
from dotenv import load_dotenv
from validate_buffers import calculate_buffer

# Load environment variables
load_dotenv()

# Initialize Google Maps Client
maps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
if not maps_key:
    print("Error: GOOGLE_MAPS_API_KEY not found in .env file.")
    exit(1)

gmaps = googlemaps.Client(key=maps_key)

def get_real_traffic_duration(origin, destination, departure_time="now"):
    """
    Fetches real-time traffic duration using Google Maps Distance Matrix API.
    Note: departure_time="now" is required for duration_in_traffic.
    """
    try:
        # Request distance matrix with traffic model
        result = gmaps.distance_matrix(
            origins=[origin],
            destinations=[destination],
            mode="driving",
            departure_time=departure_time,
            traffic_model="best_guess"
        )
        
        if result['status'] == 'OK':
            element = result['rows'][0]['elements'][0]
            if element['status'] == 'OK':
                # duration_in_traffic (seconds) converted to minutes
                duration_in_traffic = element['duration_in_traffic']['value'] // 60
                return duration_in_traffic
            else:
                print(f"Element Error: {element['status']}")
        else:
            print(f"API Error: {result['status']}")
            
    except Exception as e:
        print(f"Request failed: {e}")
    return None

def test_integration():
    # Example: Positano Pier to Amalfi Cathedral (Lat/Lng strings)
    origin_coords = "40.6270,14.4850" 
    dest_coords = "40.6330,14.6020"   
    
    print(f"Fetching real-time traffic from {origin_coords} to {dest_coords}...")
    duration = get_real_traffic_duration(origin_coords, dest_coords)
    
    if duration is not None:
        local_now = datetime.now().strftime("%H:%M")
        risk = "relaxed"
        
        # Use our validated logic from validate_buffers.py
        buffer = calculate_buffer(duration, local_now, risk)
        
        print(f"\nReal-time Traffic Estimate: {duration} mins")
        print(f"Local Time: {local_now}, Risk Tolerance: {risk}")
        print(f"Calculated applied_buffer_minutes: {buffer} mins")
        print(f"Total Suggested Gap: {duration + buffer} mins")
    else:
        print("Failed to fetch traffic data. Check your API Key and quotas.")

if __name__ == "__main__":
    test_integration()
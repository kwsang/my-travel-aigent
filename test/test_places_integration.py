import os
from google.maps import places_v1
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Google Maps/Places Client
maps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
if not maps_key:
    print("Error: GOOGLE_MAPS_API_KEY not found in .env file.")
    exit(1)

# Initialize the New Places Client
# Note: We pass the API Key via client_options
client = places_v1.PlacesClient(
    client_options={"api_key": maps_key}
)

def find_place_id(query):
    """
    Dynamically finds the first Place ID for a given text query.
    This prevents 404 errors caused by stale/expired Place IDs.
    """
    try:
        request = {"text_query": query}
        # For search_text, the field mask must prefix fields with 'places.'
        mask = "places.id,places.displayName"
        
        response = client.search_text(
            request=request,
            metadata=[("x-goog-fieldmask", mask)]
        )
        
        if response.places:
            place = response.places[0]
            return place.id
    except Exception as e:
        print(f"Search failed for '{query}': {e}")
    return None

def is_open_at_requested_time(periods, day_of_week, requested_time_str):
    """
    Checks if the requested HH:MM time falls within the venue's periods for that day.
    day_of_week: 0 (Sunday) to 6 (Saturday)
    """
    req_h, req_m = map(int, requested_time_str.split(':'))
    req_total_mins = req_h * 60 + req_m

    for period in periods:
        if period.open.day == day_of_week:
            open_mins = period.open.hour * 60 + period.open.minute
            # Handle close time (could be on the same day or next day/midnight)
            close_mins = period.close.hour * 60 + period.close.minute
            
            # Basic check: assumes open/close on same day for simplicity in this test
            if open_mins <= req_total_mins <= close_mins:
                return True
    return False

def validate_venue_availability(place_id, requested_time_str, min_rating=4.5):
    """
    Fetches place details and validates opening hours and rating.
    """
    try:
        # Define the resource name for the new API
        name = f"places/{place_id}"
        
        # Define fields to return (Field Mask)
        # Reference: https://developers.google.com/maps/documentation/places/web-service/place-details#fields
        mask = "displayName,rating,userRatingCount,regularOpeningHours,businessStatus"

        # Fetch place details via the request object and metadata
        # In the New Places API (v1), the field mask is passed as a header: x-goog-fieldmask
        result = client.get_place(
            request={"name": name},
            metadata=[("x-goog-fieldmask", mask)]
        )
        
        venue_name = result.display_name.text
        rating = result.rating
        total_ratings = result.user_rating_count
        
        print(f"--- Validating Venue: {venue_name} ---")
        print(f"Rating: {rating} ({total_ratings} reviews)")

        # 1. Transparency Rule Check
        if rating < min_rating:
            print(f"STATUS: [Budget Alternative] - Rating {rating} is below preferred {min_rating}")
        else:
            print(f"STATUS: [Top Recommendation] - Rating {rating} meets threshold.")

        # 2. Closed Door Rule Check
        if result.regular_opening_hours:
            # For testing, we use the current day of the week
            today = datetime.now().weekday()
            # Python weekday is 0=Mon, 6=Sun. Google is 0=Sun, 6=Sat.
            google_day = (today + 1) % 7
            
            is_available = is_open_at_requested_time(result.regular_opening_hours.periods, google_day, requested_time_str)
            
            status_str = "AVAILABLE" if is_available else "CLOSED/UNAVAILABLE"
            print(f"Availability for {requested_time_str} (Day {google_day}): {status_str}")
            if not is_available:
                print(f"WARNING: Venue might be closed at the requested time.")

        if result.business_status.name != 'OPERATIONAL':
            print(f"WARNING: Venue status is {result.business_status.name}")

        return result
            
    except Exception as e:
        print(f"Request failed: {e}")
    return None

def test_integration():
    # Instead of hardcoding a brittle ID, we search for the venue name
    venue_query = "Lo Guarracino, Positano"
    # min_rating from User Profile
    user_min_rating = 4.5
    
    print(f"Searching for fresh Place ID for: '{venue_query}'...")
    place_id = find_place_id(venue_query)
    
    if place_id:
        print(f"Integrating Google Places data using ID: {place_id}")
        venue_data = validate_venue_availability(place_id, "20:30", user_min_rating)
    else:
        venue_data = None

    if not venue_data:
        print("The agent uses 'google_places_details' tool to enforce Rule 3 & 5 of the SYSTEM_PROMPT.")

if __name__ == "__main__":
    test_integration()
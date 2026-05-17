import os
import json
import asyncio
import uuid
import urllib.request
import urllib.error
from typing import Optional
from google.adk.agents.invocation_context import InvocationContext

def _fetch_route_sync(origin: str, destination: str, travel_mode: str) -> str:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return "Error: GOOGLE_MAPS_API_KEY environment variable is not set."

    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
    }
    
    payload = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": travel_mode.upper()
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            if "routes" in data and data["routes"]:
                route = data["routes"][0]
                return json.dumps({
                    "status": "SUCCESS",
                    "origin": origin,
                    "destination": destination,
                    "travelMode": travel_mode.upper(),
                    "duration": route.get("duration"),
                    "distanceMeters": route.get("distanceMeters"),
                    "polyline": route.get("polyline", {}).get("encodedPolyline")
                })
            else:
                return f"No routes found between '{origin}' and '{destination}'."
    except urllib.error.HTTPError as e:
        return f"Error computing route: {e.code} - {e.read().decode('utf-8')}"
    except Exception as e:
        return f"Exception occurred while calling Routes API: {str(e)}"

async def get_route_directions(origin: str, destination: str, tool_context: InvocationContext, travel_mode: str = "DRIVE") -> str:
    """
    Gets the route duration and distance between two locations using the Google Routes API.
    
    Args:
        origin: The starting location address or place name.
        destination: The ending location address or place name.
        travel_mode: The mode of transportation. Can be 'DRIVE', 'BICYCLE', 'WALK', or 'TRANSIT'.
    """
    trip_destination = None
    starting_location = None
    if tool_context:
        state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
        itinerary = state.get("final_itinerary") or {}
        if isinstance(itinerary, str):
            try: itinerary = json.loads(itinerary)
            except: itinerary = {}
        trip_destination = itinerary.get("destination")
        
        profile = state.get("traveler_profile") or state.get("user_profile_data") or {}
        if isinstance(profile, str):
            try: profile = json.loads(profile)
            except: profile = {}
        starting_location = profile.get("preferences", {}).get("starting_location")

    if trip_destination:
        def anchor_loc(loc: str) -> str:
            if not any(c.isalpha() for c in str(loc)): return loc # Skip coordinates (e.g. "47.6,-122.3")
            if trip_destination.lower() in str(loc).lower(): return loc # Skip already anchored strings
            if starting_location and starting_location.split(',')[0].strip().lower() in str(loc).lower(): return loc # Skip the starting location
            return f"{loc} in {trip_destination}"
            
        origin = anchor_loc(origin)
        destination = anchor_loc(destination)

    raw_result = await asyncio.to_thread(_fetch_route_sync, origin, destination, travel_mode)
    try:
        res_dict = json.loads(raw_result)
        if "polyline" in res_dict:
            polyline = res_dict.pop("polyline")
            route_token = f"route_{uuid.uuid4().hex[:8]}"
            res_dict["route_token"] = route_token
            
            if tool_context:
                state = tool_context.state
                if "_route_cache" not in state:
                    state["_route_cache"] = {}
                state["_route_cache"][route_token] = polyline
                
            return json.dumps(res_dict)
    except Exception:
        pass
    return raw_result
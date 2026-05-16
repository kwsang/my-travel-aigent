import os
import json
import asyncio
import urllib.request
import urllib.error
from typing import Optional
from google.adk.agents.invocation_context import InvocationContext as Context

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

async def get_route_directions(origin: str, destination: str, travel_mode: str = "DRIVE", ctx: Optional[Context] = None) -> str:
    """
    Gets the route duration and distance between two locations using the Google Routes API.
    
    Args:
        origin: The starting location address or place name.
        destination: The ending location address or place name.
        travel_mode: The mode of transportation. Can be 'DRIVE', 'BICYCLE', 'WALK', or 'TRANSIT'.
    """
    trip_destination = None
    if ctx:
        state = getattr(ctx, "state", None) or getattr(ctx.session, "state", None) or {}
        itinerary = state.get("final_itinerary") or {}
        if isinstance(itinerary, str):
            try: itinerary = json.loads(itinerary)
            except: itinerary = {}
        trip_destination = itinerary.get("destination")

    if trip_destination:
        def anchor_loc(loc: str) -> str:
            if not any(c.isalpha() for c in str(loc)): return loc # Skip coordinates (e.g. "47.6,-122.3")
            if trip_destination.lower() in str(loc).lower(): return loc # Skip already anchored strings
            return f"{loc} in {trip_destination}"
            
        origin = anchor_loc(origin)
        destination = anchor_loc(destination)

    return await asyncio.to_thread(_fetch_route_sync, origin, destination, travel_mode)
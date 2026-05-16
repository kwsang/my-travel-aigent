import os
import json
import asyncio
import urllib.request
import urllib.error

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

async def get_route_directions(origin: str, destination: str, travel_mode: str = "DRIVE") -> str:
    """
    Gets the route duration and distance between two locations using the Google Routes API.
    
    Args:
        origin: The starting location address or place name.
        destination: The ending location address or place name.
        travel_mode: The mode of transportation. Can be 'DRIVE', 'BICYCLE', 'WALK', or 'TRANSIT'.
    """
    return await asyncio.to_thread(_fetch_route_sync, origin, destination, travel_mode)
import os
import json
import asyncio
import uuid
import urllib.request
import urllib.error
import logging
from typing import Optional
from google.adk.agents.invocation_context import InvocationContext
from gemini_agent.logic.utils import get_state_context, anchor_location
from gemini_agent.logic.cache import LRUTTLCache

logger = logging.getLogger(__name__)

_ROUTES_CACHE = LRUTTLCache()
_IN_FLIGHT_ROUTES = {}

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
    
    def _build_waypoint(loc_str: str) -> dict:
        if not any(c.isalpha() for c in str(loc_str)):
            parts = str(loc_str).split(',')
            if len(parts) == 2:
                try:
                    return {
                        "location": {
                            "latLng": {
                                "latitude": float(parts[0].strip()),
                                "longitude": float(parts[1].strip())
                            }
                        }
                    }
                except ValueError:
                    pass
        return {"address": str(loc_str)}

    payload = {
        "origin": _build_waypoint(origin),
        "destination": _build_waypoint(destination),
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
    itinerary, profile = get_state_context(tool_context)
    trip_destination = itinerary.get("destination")
    starting_location = profile.get("preferences", {}).get("starting_location")

    if trip_destination:
        origin = anchor_location(origin, trip_destination, starting_location)
        destination = anchor_location(destination, trip_destination, starting_location)

    cache_key = (origin, destination, travel_mode)
    cached_result = _ROUTES_CACHE.get(cache_key)
    
    if cached_result is not None:
        raw_result = cached_result
    elif cache_key in _IN_FLIGHT_ROUTES:
        logger.info(f"get_route_directions for '{origin}' to '{destination}' is already in progress. Waiting...")
        try:
            raw_result = await asyncio.wait_for(_IN_FLIGHT_ROUTES[cache_key], timeout=30.0)
        except asyncio.TimeoutError:
            return "Error computing route: Request timed out waiting for in-flight operation."
        except Exception as e:
            return f"Error computing route: {str(e)}"
    else:
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        _IN_FLIGHT_ROUTES[cache_key] = future
        try:
            raw_result = await asyncio.wait_for(
                asyncio.to_thread(_fetch_route_sync, origin, destination, travel_mode),
                timeout=30.0
            )
            _ROUTES_CACHE.set(cache_key, raw_result)
            future.set_result(raw_result)
        except asyncio.TimeoutError:
            err = TimeoutError("Google Routes API request timed out.")
            future.set_exception(err)
            return f"Exception occurred while calling Routes API: {str(err)}"
        except Exception as e:
            future.set_exception(e)
            return f"Exception occurred while calling Routes API: {str(e)}"
        finally:
            _IN_FLIGHT_ROUTES.pop(cache_key, None)
            
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
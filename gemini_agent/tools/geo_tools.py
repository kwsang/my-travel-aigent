import json
import logging
import asyncio
from typing import Optional
from gemini_agent.clients import places_client, gmaps_client
from gemini_agent.logic.cache import LRUTTLCache
from google.adk.agents.invocation_context import InvocationContext
from gemini_agent.logic.utils import get_state_context, anchor_location

logger = logging.getLogger(__name__)

# Simple in-memory cache to prevent duplicate API calls
_MATRIX_CACHE = LRUTTLCache()
_PLACES_CACHE = LRUTTLCache()
_GEOCODE_CACHE = LRUTTLCache()

_IN_FLIGHT_PLACES = {}
_IN_FLIGHT_MATRIX = {}

async def google_maps_matrix(origins: list[str], destinations: list[str], tool_context: InvocationContext) -> str:
    """
    Calculates real-time driving time and distance between locations.
    """
    itinerary, profile = get_state_context(tool_context)
    destination = itinerary.get("destination")
    starting_location = profile.get("preferences", {}).get("starting_location")

    if destination:
        origins = [anchor_location(o, destination, starting_location) for o in origins]
        destinations = [anchor_location(d, destination, starting_location) for d in destinations]

    logger.info(f"Tool invoked: google_maps_matrix with origins {origins} and destinations {destinations}")
    
    # Convert lists to tuples to make them hashable for the cache dictionary
    cache_key = (tuple(origins), tuple(destinations))
    cached_result = _MATRIX_CACHE.get(cache_key)
    if cached_result is not None:
        return cached_result
        
    if cache_key in _IN_FLIGHT_MATRIX:
        logger.info(f"google_maps_matrix for {origins} to {destinations} is already in progress. Waiting...")
        try:
            return await asyncio.wait_for(_IN_FLIGHT_MATRIX[cache_key], timeout=30.0)
        except asyncio.TimeoutError:
            return "Error calculating distance matrix: Request timed out waiting for in-flight operation."
        except Exception as e:
            return f"Error calculating distance matrix: {str(e)}"

    loop = asyncio.get_running_loop()
    future = loop.create_future()
    _IN_FLIGHT_MATRIX[cache_key] = future

    try:
        if gmaps_client is None:
            err_msg = "Error: Google Maps service is currently unavailable."
            future.set_result(err_msg)
            return err_msg
            
        matrix = await asyncio.wait_for(
            asyncio.to_thread(
                gmaps_client.distance_matrix,
                origins=origins,
                destinations=destinations,
                mode="driving",
                departure_time="now"
            ),
            timeout=30.0
        )
        result = json.dumps(matrix)
        _MATRIX_CACHE.set(cache_key, result)
        future.set_result(result)
        return result
    except asyncio.TimeoutError:
        err = TimeoutError("Google Maps Matrix API request timed out.")
        future.set_exception(err)
        return f"Error calculating distance matrix: {str(err)}"
    except Exception as e:
        future.set_exception(e)
        return f"Error calculating distance matrix: {str(e)}"
    finally:
        _IN_FLIGHT_MATRIX.pop(cache_key, None)

async def search_places(
    query: str,
    tool_context: InvocationContext,
    location_type: Optional[str] = None,
    location_bias: Optional[str] = None,
    interests: Optional[list[str]] = None,
) -> str:
    """
    Searches for venues, restaurants, or activities using the Google Places API.
    Dynamically enriches the query with user interests to improve semantic relevance.
    """
    itinerary, profile = get_state_context(tool_context)
    destination = itinerary.get("destination")
    starting_location = profile.get("preferences", {}).get("starting_location")

    cache_key = (query, location_type, location_bias, destination, tuple(interests) if interests else None)
    cached_result = _PLACES_CACHE.get(cache_key)
    if cached_result is not None:
        return cached_result

    if cache_key in _IN_FLIGHT_PLACES:
        logger.info(f"search_places for '{query}' is already in progress. Waiting to prevent duplicates...")
        try:
            return await asyncio.wait_for(_IN_FLIGHT_PLACES[cache_key], timeout=30.0)
        except asyncio.TimeoutError:
            return "Error searching Google Places: Request timed out waiting for in-flight operation."
        except Exception as e:
            return f"Error searching Google Places: {str(e)}"

    loop = asyncio.get_running_loop()
    future = loop.create_future()
    _IN_FLIGHT_PLACES[cache_key] = future

    try:
        if places_client is None:
            err_msg = "Error: Google Places service is currently unavailable."
            future.set_result(err_msg)
            return err_msg
            
        enhanced_query = query
        if interests:
            interest_context = ", ".join(interests)
            enhanced_query = f"{query} matching interests: {interest_context}"
            
        active_location = destination or location_bias
        location_bias_dict = None

        if active_location:
            is_starting_loc = starting_location and starting_location.split(',')[0].strip().lower() in query.lower()
            is_dest_loc = active_location.split(',')[0].strip().lower() in query.lower()
            
            if not is_starting_loc and not is_dest_loc:
                enhanced_query += f" in {active_location}"
            elif is_starting_loc:
                # Point the spatial bias to the starting location instead of the destination
                active_location = starting_location
            
            # Geocode the location to get coordinates for a 50km bias circle
            cached_geo = _GEOCODE_CACHE.get(active_location)
            if cached_geo:
                location_bias_dict = cached_geo
            else:
                try:
                    geocode_result = await asyncio.to_thread(gmaps_client.geocode, active_location)
                    if geocode_result:
                        lat = geocode_result[0]["geometry"]["location"]["lat"]
                        lng = geocode_result[0]["geometry"]["location"]["lng"]
                        location_bias_dict = {
                            "circle": {
                                "center": {"latitude": lat, "longitude": lng},
                                "radius": 50000.0  # 50km radius
                            }
                        }
                        _GEOCODE_CACHE.set(active_location, location_bias_dict)
                except Exception as e:
                    logger.warning(f"Geocoding failed for {active_location}: {e}")
            
        logger.info(f"Tool invoked: search_places with query '{enhanced_query}'")

        mask = ("places.displayName,places.id,places.editorialSummary,places.rating,"
                "places.priceLevel,places.formattedAddress,places.location,places.types,"
                "places.takeout,places.delivery,places.dineIn,places.curbsidePickup,"
                "places.servesBreakfast,places.servesLunch,places.servesDinner,"
                "places.servesBeer,places.servesWine,places.servesVegetarianFood,places.currentOpeningHours,"
                "places.goodForChildren,places.accessibilityOptions,places.businessStatus,"
                "places.regularOpeningHours,places.utcOffsetMinutes,places.userRatingCount,"
                "places.googleMapsUri")
        request = {"text_query": enhanced_query, "max_result_count": 8}
        if location_type: request["included_type"] = location_type
        if location_bias_dict: request["location_bias"] = location_bias_dict
        
        response = await asyncio.wait_for(
            asyncio.to_thread(
                places_client.search_text,
                request=request, 
                metadata=[("x-goog-fieldmask", mask)]
            ),
            timeout=30.0
        )
        
        venues = []
        for place in response.places:
            if not place.rating or not place.user_rating_count:
                continue
                
            venue = {
                "name": place.display_name.text,
                "place_id": place.id,
                "rating": place.rating,
                "user_rating_count": place.user_rating_count,
                "price_tier": place.price_level,
                "description": place.editorial_summary.text if place.editorial_summary else place.formatted_address,
                "geo": {"latitude": place.location.latitude, "longitude": place.location.longitude},
                "types": list(place.types),
                "status": place.business_status.name if hasattr(place, "business_status") else "Unknown",
                "currentOpeningHours": list(place.current_opening_hours.weekday_descriptions) if place.current_opening_hours else [],
                "regularOpeningHours": list(place.regular_opening_hours.weekday_descriptions) if place.regular_opening_hours else [],
                "utcOffsetMinutes": place.utc_offset_minutes,
                "google_maps_uri": place.google_maps_uri
            }
            venues.append(venue)
            
            if tool_context:
                state = getattr(tool_context, "state", None) or getattr(tool_context.session, "state", None) or {}
                if "_venue_cache" not in state:
                    state["_venue_cache"] = {}
                state["_venue_cache"][venue["name"]] = venue

        result_json = json.dumps(venues, default=str)
        _PLACES_CACHE.set(cache_key, result_json)
        future.set_result(result_json)
        return result_json
    except asyncio.TimeoutError:
        err = TimeoutError("Google Places API request timed out.")
        future.set_exception(err)
        return f"Error searching Google Places: {str(err)}"
    except Exception as e:
        future.set_exception(e)
        return f"Error searching Google Places: {str(e)}"
    finally:
        _IN_FLIGHT_PLACES.pop(cache_key, None)

async def search_local_events(location: str, tool_context: InvocationContext, query: str = "festivals and events") -> str:
    """
    Searches for current local events, festivals, and happenings in a specific city.
    Useful for providing real-time value and engagement during the user intake process.
    """
    itinerary, _ = get_state_context(tool_context)
    destination = itinerary.get("destination")
    
    active_location = destination or location

    logger.info(f"Tool invoked: search_local_events in '{active_location}' with query '{query}'")
    # Leverages the robust search_places logic with a specialized event-centric query
    return await search_places(query=query, tool_context=tool_context, location_bias=active_location)
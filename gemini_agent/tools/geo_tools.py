import json
import logging
import asyncio
from typing import Optional
from gemini_agent.clients import places_client, gmaps_client
from gemini_agent.logic.cache import LRUTTLCache
from google.adk.agents.invocation_context import InvocationContext as Context

logger = logging.getLogger(__name__)

# Simple in-memory cache to prevent duplicate API calls
_MATRIX_CACHE = LRUTTLCache()
_PLACES_CACHE = LRUTTLCache()
_GEOCODE_CACHE = LRUTTLCache()

async def google_maps_matrix(origins: list[str], destinations: list[str], ctx: Context = None) -> str:
    """
    Calculates real-time driving time and distance between locations.
    """
    destination = None
    if ctx:
        state = getattr(ctx, "state", None) or getattr(ctx.session, "state", None) or {}
        itinerary = state.get("final_itinerary") or {}
        if isinstance(itinerary, str):
            try: itinerary = json.loads(itinerary)
            except: itinerary = {}
        destination = itinerary.get("destination")

    if destination:
        def anchor_loc(loc: str) -> str:
            if not any(c.isalpha() for c in str(loc)): return loc # Skip coordinates (e.g. "47.6,-122.3")
            if destination.lower() in str(loc).lower(): return loc # Skip already anchored strings
            return f"{loc} in {destination}"
            
        origins = [anchor_loc(o) for o in origins]
        destinations = [anchor_loc(d) for d in destinations]

    logger.info(f"Tool invoked: google_maps_matrix with origins {origins} and destinations {destinations}")
    
    # Convert lists to tuples to make them hashable for the cache dictionary
    cache_key = (tuple(origins), tuple(destinations))
    cached_result = _MATRIX_CACHE.get(cache_key)
    if cached_result is not None:
        return cached_result
        
    try:
        if gmaps_client is None:
            return "Error: Google Maps service is currently unavailable."
            
        matrix = await asyncio.to_thread(
            gmaps_client.distance_matrix,
            origins=origins,
            destinations=destinations,
            mode="driving",
            departure_time="now"
        )
        result = json.dumps(matrix)
        _MATRIX_CACHE.set(cache_key, result)
        return result
    except Exception as e:
        return f"Error calculating distance matrix: {str(e)}"

async def search_places(
    query: str,
    location_type: Optional[str] = None,
    location_bias: Optional[str] = None,
    interests: Optional[list[str]] = None,
    ctx: Context = None
) -> str:
    """
    Searches for venues, restaurants, or activities using the Google Places API.
    Dynamically enriches the query with user interests to improve semantic relevance.
    """
    destination = None
    if ctx:
        state = getattr(ctx, "state", None) or getattr(ctx.session, "state", None) or {}
        itinerary = state.get("final_itinerary") or {}
        if isinstance(itinerary, str):
            try: itinerary = json.loads(itinerary)
            except: itinerary = {}
        destination = itinerary.get("destination")

    cache_key = (query, location_type, location_bias, destination, tuple(interests) if interests else None)
    cached_result = _PLACES_CACHE.get(cache_key)
    if cached_result is not None:
        return cached_result

    try:
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
            
        enhanced_query = query
        if interests:
            interest_context = ", ".join(interests)
            enhanced_query = f"{query} matching interests: {interest_context}"
            
        active_location = destination or location_bias
        location_bias_dict = None

        if active_location:
            enhanced_query += f" in {active_location}"
            
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
                "places.regularOpeningHours,places.utcOffsetMinutes,places.userRatingCount")
        request = {"text_query": enhanced_query, "max_result_count": 8}
        if location_type: request["included_type"] = location_type
        if location_bias_dict: request["location_bias"] = location_bias_dict
        
        response = await asyncio.to_thread(
            places_client.search_text,
            request=request, 
            metadata=[("x-goog-fieldmask", mask)]
        )
        
        venues = []
        for place in response.places:
            venues.append({
                "name": place.display_name.text,
                "place_id": place.id,
                "rating": place.rating,
                "user_rating_count": place.user_rating_count,
                "price_tier": place.price_level,
                "description": place.editorial_summary.text if place.editorial_summary else place.formatted_address,
                "geo": {"latitude": place.location.latitude, "longitude": place.location.longitude},
                "types": place.types,
                "status": place.business_status.name if hasattr(place, "business_status") else "Unknown",
                "currentOpeningHours": str(place.current_opening_hours) if place.current_opening_hours else "Not available",
                "regularOpeningHours": str(place.regular_opening_hours) if place.regular_opening_hours else "Not available",
                "utcOffsetMinutes": place.utc_offset_minutes
            })
        result_json = json.dumps(venues, default=str)
        _PLACES_CACHE.set(cache_key, result_json)
        return result_json
    except Exception as e:
        return f"Error searching Google Places: {str(e)}"

async def search_local_events(location: str, query: str = "festivals and events", ctx: Context = None) -> str:
    """
    Searches for current local events, festivals, and happenings in a specific city.
    Useful for providing real-time value and engagement during the user intake process.
    """
    destination = None
    if ctx:
        state = getattr(ctx, "state", None) or getattr(ctx.session, "state", None) or {}
        itinerary = state.get("final_itinerary") or {}
        if isinstance(itinerary, str):
            try: itinerary = json.loads(itinerary)
            except: itinerary = {}
        destination = itinerary.get("destination")

    active_location = destination or location

    logger.info(f"Tool invoked: search_local_events in '{active_location}' with query '{query}'")
    # Leverages the robust search_places logic with a specialized event-centric query
    return await search_places(query=query, location_bias=active_location)
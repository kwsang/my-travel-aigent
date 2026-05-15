import json
import logging
import asyncio
from gemini_agent.clients import places_client, gmaps_client
from gemini_agent.tools.cache import LRUTTLCache

logger = logging.getLogger(__name__)

# Simple in-memory cache to prevent duplicate API calls
_MATRIX_CACHE = LRUTTLCache()
_PLACES_CACHE = LRUTTLCache()

async def google_maps_matrix(origins: list[str], destinations: list[str]) -> str:
    """
    Calculates real-time driving time and distance between locations.
    """
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

async def search_places(text_query: str, location_bias: str = None, **kwargs) -> str:
    """
    Searches for venues using the Google Places API.
    """
    logger.info(f"Tool invoked: search_places with query '{text_query}', location_bias '{location_bias}'")
    
    cache_key = (text_query, location_bias, frozenset(kwargs.items()))
    cached_result = _PLACES_CACHE.get(cache_key)
    if cached_result is not None:
        return cached_result

    try:
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
            
        mask = ("places.displayName,places.id,places.editorialSummary,places.rating,"
                "places.priceLevel,places.formattedAddress,places.location,places.types,"
                "places.takeout,places.delivery,places.dineIn,places.curbsidePickup,"
                "places.servesBreakfast,places.servesLunch,places.servesDinner,"
                "places.servesBeer,places.servesWine,places.servesVegetarianFood,places.currentOpeningHours,"
                "places.goodForChildren,places.accessibilityOptions,places.businessStatus,"
                "places.regularOpeningHours,places.utcOffsetMinutes,places.userRatingCount")
        query = f"{text_query} in {location_bias}" if location_bias else text_query
        request = {"text_query": query, "max_result_count": 8}
        if kwargs.get("location_type"): request["included_type"] = kwargs["location_type"]
        
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

async def search_local_events(location: str, query: str = "festivals and events") -> str:
    """
    Searches for current local events, festivals, and happenings in a specific city.
    Useful for providing real-time value and engagement during the user intake process.
    """
    logger.info(f"Tool invoked: search_local_events in '{location}' with query '{query}'")
    # Leverages the robust search_places logic with a specialized event-centric query
    return await search_places(text_query=f"{query} in {location}")
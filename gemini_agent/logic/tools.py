import os
import httpx
import logging
from typing import List, Optional
from gemini_agent.tools.cache import LRUTTLCache

logger = logging.getLogger(__name__)

# Simple in-memory cache to prevent duplicate API calls
_MATRIX_CACHE = LRUTTLCache()
_DETAILS_CACHE = LRUTTLCache()
_PLACES_CACHE = LRUTTLCache()

async def search_places(
    query: str,
    location_type: str,
    location_bias: Optional[str] = None,
    interests: Optional[List[str]] = None
) -> List[dict]:
    """
    Searches for venues, restaurants, or activities using the Google Places API (New).
    Dynamically enriches the query with user interests to improve semantic relevance.

    Args:
        query: Specific search intent (e.g., 'Art Deco cafes').
        location_type: The segment category (e.g., 'restaurant', 'museum').
        location_bias: Optional geographic anchor (address or venue name) to center the search.
        interests: Optional list of user interests from their profile to refine results.
    """
    cache_key = (query, location_type, location_bias, tuple(interests) if interests else None)
    cached_data = _PLACES_CACHE.get(cache_key)
    if cached_data is not None:
        return cached_data

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    url = "https://places.googleapis.com/v1/places:searchText"

    # 1. Dynamic Query Enrichment
    # We combine the primary query with interests into a natural language string.
    # This leverages the API's internal ranking to surface venues matching the "vibe."
    enhanced_query = query
    if interests:
        interest_context = ", ".join(interests)
        enhanced_query = f"{query} matching interests: {interest_context}"
    
    if location_bias:
        enhanced_query += f" near {location_bias}"

    payload = {
        "textQuery": enhanced_query,
        "includedType": location_type,
        "maxResultCount": 10,
        "rankPreference": "RELEVANCE"
    }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,places.location,"
            "places.rating,places.userRatingCount,places.priceLevel,places.types,"
            "places.editorialSummary,places.regularOpeningHours"
        )
    }

    async with httpx.AsyncClient() as client:
        try:
            logger.info(f"Executing Enriched Search: {enhanced_query}")
            response = await client.post(url, json=payload, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json().get("places", [])
            _PLACES_CACHE.set(cache_key, data)
            return data
        except Exception as e:
            logger.error(f"Places Search Error: {e}")
            return []

async def google_places_details(place_id: str) -> dict:
    """
    Retrieves deep metadata for a specific venue to verify operating hours and status.
    """
    cached_data = _DETAILS_CACHE.get(place_id)
    if cached_data is not None:
        return cached_data

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "id,businessStatus,currentOpeningHours,utcOffsetMinutes"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            _DETAILS_CACHE.set(place_id, data)
            return data
        except Exception as e:
            logger.error(f"Places Details Error: {e}")
            return {}

async def google_maps_matrix(origins: List[str], destinations: List[str]) -> dict:
    """
    Invokes the Distance Matrix API to get ground-truth transit durations in traffic.
    Used to calculate precision buffers for the visual timeline.
    """
    # Convert lists to tuples to make them hashable for the cache dictionary
    cache_key = (tuple(origins), tuple(destinations))
    cached_data = _MATRIX_CACHE.get(cache_key)
    if cached_data is not None:
        return cached_data

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    
    params = {
        "origins": "|".join(origins),
        "destinations": "|".join(destinations),
        "departure_time": "now",
        "key": api_key
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            _MATRIX_CACHE.set(cache_key, data)
            return data
        except Exception as e:
            logger.error(f"Maps Matrix Error: {e}")
            return {}
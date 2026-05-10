import json
from gemini_agent.clients import places_client, gmaps_client

def google_maps_matrix(origins: list[str], destinations: list[str]) -> str:
    """
    Calculates real-time driving time and distance between locations.
    """
    try:
        if gmaps_client is None:
            return "Error: Google Maps service is currently unavailable."
            
        matrix = gmaps_client.distance_matrix(
            origins=origins,
            destinations=destinations,
            mode="driving",
            departure_time="now"
        )
        return json.dumps(matrix)
    except Exception as e:
        return f"Error calculating distance matrix: {str(e)}"

def google_places_details(name: str) -> str:
    """
    Retrieves detailed information (rating, business status, opening hours) for a specific place.
    """
    try:
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
            
        mask = "displayName,rating,userRatingCount,regularOpeningHours,businessStatus,currentOpeningHours"
        result = places_client.get_place(
            request={"name": name},
            metadata=[("x-goog-fieldmask", mask)]
        )
        details = {
            "name": result.display_name.text,
            "rating": result.rating,
            "user_rating_count": result.user_rating_count,
            "status": result.business_status.name,
            "regular_opening_hours": str(result.regular_opening_hours) if result.regular_opening_hours else "Not available",
            "current_opening_hours": str(result.current_opening_hours) if result.current_opening_hours else "Not available"
        }
        return json.dumps(details)
    except Exception as e:
        return f"Error fetching place details: {str(e)}"

def search_places(text_query: str, location_bias: str = None, **kwargs) -> str:
    """
    Searches for venues using the Google Places API.
    """
    try:
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
            
        mask = ("places.displayName,places.id,places.editorialSummary,places.rating,"
                "places.priceLevel,places.formattedAddress,places.location,places.types,"
                "places.takeout,places.delivery,places.dineIn,places.curbsidePickup,"
                "places.servesBreakfast,places.servesLunch,places.servesDinner,"
                "places.servesBeer,places.servesWine,places.servesVegetarianFood,places.currentOpeningHours,"
                "places.goodForChildren,places.accessibilityOptions")
        query = f"{text_query} in {location_bias}" if location_bias else text_query
        request = {"text_query": query, "max_result_count": 8}
        if kwargs.get("location_type"): request["included_type"] = kwargs["location_type"]
        response = places_client.search_text(request=request, metadata=[("x-goog-fieldmask", mask)])
        
        venues = []
        for place in response.places:
            venues.append({
                "name": place.display_name.text,
                "place_id": place.id,
                "rating": place.rating,
                "price_tier": place.price_level,
                "description": place.editorial_summary.text if place.editorial_summary else place.formatted_address,
                "geo": {"latitude": place.location.latitude, "longitude": place.location.longitude},
                "types": place.types,
                "currentOpeningHours": str(place.current_opening_hours) if place.current_opening_hours else None
            })
        return json.dumps(venues, default=str)
    except Exception as e:
        return f"Error searching Google Places: {str(e)}"

def search_local_events(location: str, query: str = "festivals and events") -> str:
    """
    Searches for current local events, festivals, and happenings in a specific city.
    Useful for providing real-time value and engagement during the user intake process.
    """
    # Leverages the robust search_places logic with a specialized event-centric query
    return search_places(text_query=f"{query} in {location}")
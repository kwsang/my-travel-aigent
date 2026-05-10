import json
import datetime
from typing import Any
from ..clients import voyage_client, destinations_collection, places_client, gmaps_client
from .models import UserProfile, Destination
from google.adk.agents.invocation_context import InvocationContext as Context
from vertexai.generative_models import GenerativeModel

def record_user_profile(profile: UserProfile, tool_context: Any) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Enforces Couple-First Pricing Logic and strict schema adherence.
    """
    # Enforce defaults and business rules on the validated model instance
    prefs = profile.preferences
    total_people = prefs.party_size.adults + prefs.party_size.children

    # 1. Enforce Couple Assumption Logic (2 people = 1 bed/room shared)
    if total_people == 2:
        if prefs.group_planning_per_person is None:
            prefs.group_planning_per_person = False
        if prefs.room_sharing is None:
            prefs.room_sharing = True
        if prefs.people_per_room is None:
            prefs.people_per_room = 2
        
        # Assume romantic trip for couples sharing a bed
        if not any("romantic" in s.lower() for s in prefs.travel_style):
            prefs.travel_style.append("romantic")

    # 2. General Fallbacks for fields that might be missing from the model input
    if prefs.group_planning_per_person is None:
        prefs.group_planning_per_person = True
    if prefs.room_sharing is None:
        prefs.room_sharing = False
    if prefs.people_per_room is None:
        prefs.people_per_room = 1

    # Note: Access to system services is via the tool_context:
    # Save the strictly validated profile dictionary to the context state
    tool_context.state.update({"user_profile_data": profile.model_dump()})
    return "User profile recorded successfully. Transitioning to Architect mode."

def query_user_profile(user_id: str, tool_context: Any) -> str:
    """
    Retrieves a user's persistent travel profile and preferences from MongoDB.
    """
    try:
        db = destinations_collection.database
        profile = db["user_profiles"].find_one({"user_id": user_id})
        if not profile:
            return f"No profile found for user '{user_id}'."
        return json.dumps(profile, default=str)
    except Exception as e:
        return f"Error retrieving profile: {str(e)}"

def save_itinerary(itinerary: dict, tool_context: Any) -> str:
    """
    Persists a finalized, multi-day travel itinerary to MongoDB Atlas.
    """
    try:
        db = destinations_collection.database
        itinerary["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = db["itineraries"].insert_one(itinerary)
        return f"SUCCESS: Itinerary saved with ID {result.inserted_id}."
    except Exception as e:
        return f"Error saving itinerary: {str(e)}"

def google_maps_matrix(origins: list[str], destinations: list[str]) -> str:
    """
    Calculates real-time driving time and distance between locations.
    """
    try:
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

def search_destinations(query: str) -> str:
    """
    Performs a semantic search for travel destinations (strictly cities and towns).
    """
    try:
        embedding = voyage_client.embed([query], model="voyage-4", input_type="query").embeddings[0]
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "description_embedding",
                    "queryVector": embedding,
                    "numCandidates": 100,
                    "limit": 5
                }
            },
            {"$project": {"_id": 0, "description_embedding": 0}}
        ]
        results = list(destinations_collection.aggregate(pipeline))
        if not results:
            return f"No destinations found matching '{query}'. Try a different vibe or invoke discover_new_destination."

        validated_destinations = [Destination.model_validate(res).model_dump() for res in results]
        return json.dumps(validated_destinations)
    except Exception as e:
        return f"Error during semantic search: {str(e)}"

def discover_new_destination(vibe_or_city: str) -> str:
    """
    Autonomous Producer Tool: Discovers and seeds a new city destination into MongoDB.
    """
    try:
        discovery_model = GenerativeModel("gemini-2.5-flash")
        prompt = (
            f"Based on the input '{vibe_or_city}', identify the single most relevant major or popular "
            "city or town in the USA. Return only the name in 'City, State' format."
        )
        candidate = discovery_model.generate_content(prompt).text.strip()

        if destinations_collection.find_one({"name": {"$regex": f"^{candidate.split(',')[0]}", "$options": "i"}}):
            return f"Destination '{candidate}' is already in the atlas."

        mask = "places.displayName,places.location,places.formattedAddress,places.types"
        request = {"text_query": f"{candidate}, USA", "included_type": "locality", "max_result_count": 1}
        response = places_client.search_text(request=request, metadata=[("x-goog-fieldmask", mask)])
        
        if not response.places:
            return f"Google Maps could not verify '{candidate}' as a valid US locality."

        place = response.places[0]
        description = (f"The city of {place.display_name.text}. A US destination discovered for its "
                      f"'{vibe_or_city}' characteristics, located in {place.formatted_address}.")
        
        embedding = voyage_client.embed([description], model="voyage-4", input_type="document").embeddings[0]
        new_dest = {
            "name": place.display_name.text,
            "country": "USA",
            "description": description,
            "description_embedding": embedding,
            "location": {"type": "Point", "coordinates": [place.location.longitude, place.location.latitude]},
            "vibe_tags": vibe_or_city.lower().split()
        }
        destinations_collection.insert_one(new_dest)
        return f"SUCCESS: Added '{place.display_name.text}' to the atlas."
    except Exception as e:
        return f"Discovery failed: {str(e)}"

def search_places(text_query: str, location_bias: str = None, **kwargs) -> str:
    """
    Searches for venues using the Google Places API.
    """
    try:
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
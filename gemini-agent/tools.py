import json
from .clients import voyage_client, destinations_collection, places_client, gmaps_client
from google.adk.agents.invocation_context import InvocationContext as Context
from vertexai.generative_models import GenerativeModel

def record_user_profile(profile: dict, ctx: Context) -> str:
    """
    Saves the gathered user travel preferences into the session state.
    Enforces Couple-First Pricing Logic.
    """
    prefs = profile.get("preferences", {})
    party = prefs.get("party_size", {})
    total_people = int(party.get("adults", 0)) + int(party.get("children", 0))
    
    if total_people == 2 and "group_planning_per_person" not in prefs:
        prefs["group_planning_per_person"] = False

    ctx.state.update({"user_profile_data": profile})
    return "User profile recorded successfully. Transitioning to Architect mode."

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
        return json.dumps(results, default=str)
    except Exception as e:
        return f"Error during semantic search: {str(e)}"

def discover_new_destination(vibe_or_city: str) -> str:
    """
    Autonomous Producer Tool: Discovers and seeds a new city destination into MongoDB.
    """
    try:
        discovery_model = GenerativeModel("gemini-1.5-flash")
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

def search_places(
    text_query: str,
    location_bias: str = None,
    location_type: str = None,
    serves_vegetarian_food: bool = None,
    dine_in: bool = None,
    serves_breakfast: bool = None,
    serves_lunch: bool = None,
    serves_dinner: bool = None,
    good_for_children: bool = None,
    wheelchair_accessible_entrance: bool = None
) -> str:
    """
    Searches for venues using the Google Places API with hard requirement filtering.
    """
    try:
        mask = ("places.displayName,places.id,places.editorialSummary,places.rating,"
                "places.priceLevel,places.formattedAddress,places.location,places.types,"
                "places.takeout,places.delivery,places.dineIn,places.curbsidePickup,"
                "places.servesBreakfast,places.servesLunch,places.servesDinner,"
                "places.servesBeer,places.servesWine,places.servesVegetarianFood,"
                "places.goodForChildren,places.wheelchairAccessibleEntrance")
        query = f"{text_query} in {location_bias}" if location_bias else text_query
        request = {"text_query": query, "max_result_count": 8}
        if location_type: request["included_type"] = location_type
        response = places_client.search_text(request=request, metadata=[("x-goog-fieldmask", mask)])
        
        venues = []
        for place in response.places:
            if serves_vegetarian_food is not None and place.serves_vegetarian_food != serves_vegetarian_food: continue
            if dine_in is not None and place.dine_in != dine_in: continue
            if serves_breakfast is not None and place.serves_breakfast != serves_breakfast: continue
            if serves_lunch is not None and place.serves_lunch != serves_lunch: continue
            if serves_dinner is not None and place.serves_dinner != serves_dinner: continue
            if good_for_children is not None and place.good_for_children != good_for_children: continue
            if wheelchair_accessible_entrance is not None and place.wheelchair_accessible_entrance != wheelchair_accessible_entrance: continue

            venues.append({
                "name": place.display_name.text,
                "place_id": place.id,
                "rating": place.rating,
                "price_tier": place.price_level,
                "description": place.editorial_summary.text if place.editorial_summary else place.formatted_address,
                "geo": {"latitude": place.location.latitude, "longitude": place.location.longitude},
                "types": place.types,
                "takeout": place.takeout,
                "delivery": place.delivery,
                "dineIn": place.dine_in,
                "curbsidePickup": place.curbside_pickup,
                "servesBreakfast": place.serves_breakfast,
                "servesLunch": place.serves_lunch,
                "servesDinner": place.serves_dinner,
                "servesBeer": place.serves_beer,
                "servesWine": place.serves_wine,
                "servesVegetarianFood": place.serves_vegetarian_food,
                "goodForChildren": place.good_for_children,
                "wheelchairAccessibleEntrance": place.wheelchair_accessible_entrance
            })
        return json.dumps(venues, default=str)
    except Exception as e:
        return f"Error searching Google Places: {str(e)}"

def calculate_travel_time(origin_geo: dict, dest_geo: dict) -> int:
    """Helper to calculate driving minutes between two points."""
    try:
        origin = f"{origin_geo['latitude']},{origin_geo['longitude']}"
        destination = f"{dest_geo['latitude']},{dest_geo['longitude']}"
        matrix = gmaps_client.distance_matrix(origins=[origin], destinations=[destination], mode="driving", departure_time="now")
        if matrix['status'] == 'OK':
            element = matrix['rows'][0]['elements'][0]
            if element['status'] == 'OK':
                return element['duration_in_traffic']['value'] // 60
    except Exception:
        pass
    return 0
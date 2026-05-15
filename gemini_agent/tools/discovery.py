import json
from gemini_agent.clients import voyage_client, destinations_collection, places_client, discovery_model
from .models import Destination
import asyncio

async def search_destinations(query: str) -> str:
    """
    Performs a semantic search for travel destinations (strictly cities and towns).
    """
    try:
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        embed_resp = await asyncio.to_thread(voyage_client.embed, [query], model="voyage-4", input_type="query")
        embedding = embed_resp.embeddings[0]
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
        results = await destinations_collection.aggregate(pipeline).to_list(length=5)
        if not results:
            return f"No destinations found matching '{query}'. Try a different vibe or invoke discover_new_destination."

        validated_destinations = [Destination.model_validate(res).model_dump() for res in results]
        return json.dumps(validated_destinations)
    except Exception as e:
        return f"Error during semantic search: {str(e)}"

async def discover_new_destination(vibe_or_city: str) -> str:
    """
    Autonomous Producer Tool: Discovers and seeds a new city destination into MongoDB.
    """
    try:
        if discovery_model is None:
            return "Error: Discovery model service is currently unavailable."
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
        if places_client is None:
            return "Error: Google Places service is currently unavailable."
        if voyage_client is None:
            return "Error: Voyage AI service is currently unavailable."

        prompt = (
            f"Based on the input '{vibe_or_city}', identify the single most relevant major or popular "
            "city or town in the USA. Return only the name in 'City, State' format."
        )
        response = await discovery_model.generate_content_async(prompt)
        candidate = response.text.strip()

        if await destinations_collection.find_one({"name": {"$regex": f"^{candidate.split(',')[0]}", "$options": "i"}}):
            return f"Destination '{candidate}' is already in the atlas."

        mask = "places.displayName,places.location,places.formattedAddress,places.types"
        request = {"text_query": f"{candidate}, USA", "included_type": "locality", "max_result_count": 1}
        
        response = await asyncio.to_thread(
            places_client.search_text,
            request=request, 
            metadata=[("x-goog-fieldmask", mask)]
        )
        
        if not response.places:
            return f"Google Maps could not verify '{candidate}' as a valid US locality."

        place = response.places[0]
        description = (f"The city of {place.display_name.text}. A US destination discovered for its "
                      f"'{vibe_or_city}' characteristics, located in {place.formatted_address}.")
        
        embed_resp = await asyncio.to_thread(voyage_client.embed, [description], model="voyage-4", input_type="document")
        embedding = embed_resp.embeddings[0]
        new_dest = {
            "name": place.display_name.text,
            "country": "USA",
            "description": description,
            "description_embedding": embedding,
            "location": {"type": "Point", "coordinates": [place.location.longitude, place.location.latitude]},
            "vibe_tags": vibe_or_city.lower().split()
        }
        await destinations_collection.insert_one(new_dest)
        return f"SUCCESS: Added '{place.display_name.text}' to the atlas."
    except Exception as e:
        return f"Discovery failed: {str(e)}"

async def save_destination_accommodations(destination_name: str, accommodations: list[dict]) -> str:
    """
    Saves a list of suggested accommodations to a specific destination in the atlas.
    Useful for caching great hotel options for a city so users can browse them later.
    """
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        search_name = destination_name.split(',')[0].strip()
        result = await destinations_collection.update_one(
            {"name": {"$regex": f"^{search_name}", "$options": "i"}},
            {"$set": {"suggested_accommodations": accommodations}}
        )
        
        if result.matched_count == 0:
            return f"Error: Destination '{destination_name}' not found in the atlas. Use discover_new_destination first."
            
        return f"SUCCESS: Accommodations saved to destination '{destination_name}'."
    except Exception as e:
        return f"Error saving accommodations to destination: {str(e)}"

async def save_destination_activities(destination_name: str, activities: list[dict]) -> str:
    """
    Saves a list of suggested activities to a specific destination in the atlas.
    Useful for caching great experience and dining options for a city so users can browse them later.
    """
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        search_name = destination_name.split(',')[0].strip()
        result = await destinations_collection.update_one(
            {"name": {"$regex": f"^{search_name}", "$options": "i"}},
            {"$set": {"suggested_activities": activities}}
        )
        
        if result.matched_count == 0:
            return f"Error: Destination '{destination_name}' not found in the atlas. Use discover_new_destination first."
            
        return f"SUCCESS: Activities saved to destination '{destination_name}'."
    except Exception as e:
        return f"Error saving activities to destination: {str(e)}"

async def get_cached_accommodations(destination_name: str) -> str:
    """
    Retrieves a list of highly recommended, pre-cached accommodations for a specific destination from the database.
    Always use this before falling back to search_places.
    """
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        search_name = destination_name.split(',')[0].strip()
        dest = await destinations_collection.find_one({"name": {"$regex": f"^{search_name}", "$options": "i"}})
        
        if dest and dest.get("suggested_accommodations"):
            return json.dumps(dest["suggested_accommodations"], default=str)
            
        return "No cached accommodations found. Please use the search_places tool instead."
    except Exception as e:
        return f"Error fetching cached accommodations: {str(e)}"

async def get_cached_activities(destination_name: str) -> str:
    """
    Retrieves a list of highly recommended, pre-cached activities and dining options for a specific destination from the database.
    Always use this before falling back to search_places.
    """
    try:
        if destinations_collection is None:
            return "Error: Destination database connection is currently unavailable."
            
        search_name = destination_name.split(',')[0].strip()
        dest = await destinations_collection.find_one({"name": {"$regex": f"^{search_name}", "$options": "i"}})
        
        if dest and dest.get("suggested_activities"):
            return json.dumps(dest["suggested_activities"], default=str)
            
        return "No cached activities found. Please use the search_places tool instead."
    except Exception as e:
        return f"Error fetching cached activities: {str(e)}"
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from .phase1_state_tools import get_db

logger = logging.getLogger(__name__)

async def save_places_to_cache(places: List[Dict[str, Any]]) -> str:
    """
    Saves place data (like Google Places API responses) to the MongoDB geospatial cache.
    Automatically formats latitude and longitude into GeoJSON for spatial queries.
    
    Args:
        places: A list of dictionaries containing place details and geometry.
    """
    if not places:
        return "No places to cache."

    db = get_db()
    formatted_places = []
    
    for p in places:
        # Extract lat/lng from standard Google Places API format or internal format
        lat, lng = None, None
        
        if "geometry" in p and "location" in p["geometry"]:
            lat = p["geometry"]["location"].get("lat")
            lng = p["geometry"]["location"].get("lng")
        elif "location" in p:
            lat = p["location"].get("latitude") or p["location"].get("lat")
            lng = p["location"].get("longitude") or p["location"].get("lng")
            
        if lat is not None and lng is not None:
            # MongoDB requires GeoJSON Point format for 2dsphere indexes
            p["location"] = {
                "type": "Point",
                "coordinates": [float(lng), float(lat)] # Note: GeoJSON is always [longitude, latitude]
            }
            p["cached_at"] = datetime.now(timezone.utc)
            formatted_places.append(p)

    if formatted_places:
        await db.places_cache.insert_many(formatted_places)
        return f"Successfully cached {len(formatted_places)} places for future local searches."
        
    return "No valid locations found to cache."


async def find_nearby_cached_places(lat: float, lng: float, radius_meters: int = 2000, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Finds previously cached places near a specific latitude and longitude without calling external APIs.
    Use this FIRST when looking for nearby activities, restaurants, or lodging to save time and API costs.
    
    Args:
        lat: Latitude of the center point.
        lng: Longitude of the center point.
        radius_meters: Maximum distance in meters to search (default 2000m).
        category: Optional keyword to filter places (e.g., 'restaurant', 'museum', 'hotel').
    """
    db = get_db()
    
    query: Dict[str, Any] = {
        "location": {
            "$near": {
                "$geometry": {"type": "Point", "coordinates": [float(lng), float(lat)]},
                "$maxDistance": radius_meters
            }
        }
    }
    
    if category:
        # Flexible matching against Google Place types or names
        query["$or"] = [
            {"types": category.lower()},
            {"name": {"$regex": category, "$options": "i"}}
        ]
        
    # Return top 5 to protect the LLM context window limits
    cursor = db.places_cache.find(query, {"_id": 0}).limit(5)
    return await cursor.to_list(length=5)
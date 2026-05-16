import asyncio
import logging
import math
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

from gemini_agent.clients import destinations_collection

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cleanup")

# Define the maximum allowed distance in kilometers (50km is approx 31 miles)
MAX_DISTANCE_KM = 50.0

def haversine(lat1, lon1, lat2, lon2):
    """Calculates the great-circle distance between two points on the Earth surface."""
    R = 6371.0 # Earth radius in kilometers
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat / 2) * math.sin(dLat / 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon / 2) * math.sin(dLon / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

async def clean_distant_suggestions():
    if destinations_collection is None:
        logger.error("Database connection is not initialized. Check your credentials.")
        return

    cursor = destinations_collection.find({})
    docs = await cursor.to_list(length=None)

    logger.info(f"Checking {len(docs)} destinations for distant suggestions (> {MAX_DISTANCE_KM}km)...")
    total_removed = 0

    for doc in docs:
        name = doc.get("name", "Unknown")
        location = doc.get("location", {})
        
        if not location or "coordinates" not in location:
            logger.warning(f"No coordinates found for destination '{name}'. Skipping.")
            continue

        # MongoDB GeoJSON uses [longitude, latitude]
        dest_lon, dest_lat = location["coordinates"]

        accommodations = doc.get("suggested_accommodations", [])
        activities = doc.get("suggested_activities", [])

        valid_accommodations = []
        valid_activities = []
        changed = False

        for items, valid_list, item_type in [(accommodations, valid_accommodations, "accommodation"), (activities, valid_activities, "activity")]:
            for item in items:
                geo = item.get("geo", {}) or item.get("details", {}).get("geo", {})
                if geo and "latitude" in geo and "longitude" in geo:
                    dist = haversine(dest_lat, dest_lon, geo["latitude"], geo["longitude"])
                    if dist <= MAX_DISTANCE_KM:
                        valid_list.append(item)
                    else:
                        logger.info(f"  -> Removing {item_type} '{item.get('name', 'Unknown')}' from '{name}' (Distance: {dist:.1f} km)")
                        changed = True
                        total_removed += 1
                else:
                    valid_list.append(item)

        if changed:
            await destinations_collection.update_one({"_id": doc["_id"]}, {"$set": {"suggested_accommodations": valid_accommodations, "suggested_activities": valid_activities}})
            logger.info(f"Updated '{name}' in database.")

    logger.info(f"Cleanup complete. Removed a total of {total_removed} distant suggestions.")

if __name__ == "__main__":
    asyncio.run(clean_distant_suggestions())
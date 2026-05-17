import asyncio
import logging

from gemini_agent.clients import destinations_collection, places_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def parse_price_level(pl) -> int:
    """Helper to safely convert Google Places price levels to an integer from 1 to 4."""
    if isinstance(pl, int):
        return pl
    if isinstance(pl, str):
        pl_upper = pl.upper()
        if "FREE" in pl_upper or "INEXPENSIVE" in pl_upper or "1" in pl_upper:
            return 1
        if "VERY_EXPENSIVE" in pl_upper or "4" in pl_upper:
            return 4
        if "EXPENSIVE" in pl_upper or "3" in pl_upper:
            return 3
        # Default to MODERATE / 2 for fallbacks
        return 2
    return 2

async def populate_missing_fields():
    if destinations_collection is None:
        logger.error("Database connection unavailable. Check your environment variables.")
        return

    destinations = await destinations_collection.find({}).to_list(length=None)
    updated_count = 0

    for dest in destinations:
        changed = False
        all_price_levels = []
        
        # 1. Backfill missing venue data for Activities and Lodging
        for field in ["suggested_lodging", "suggested_activities"]:
            items = dest.get(field, [])
            for item in items:
                name = item.get("name")
                if not name:
                    continue
                    
                # Track known prices to calculate the destination's average later
                pt = item.get("price_tier") or item.get("priceLevel")
                if pt is not None:
                    all_price_levels.append(parse_price_level(pt))

                # If missing key fields, fetch them via Places API
                if "rating" not in item or ("price_tier" not in item and "priceLevel" not in item):
                    logger.info(f"Fetching missing rating/price for {name} in {dest.get('name', 'Unknown')}...")
                    try:
                        request = {"text_query": f"{name} in {dest.get('name', '')}", "max_result_count": 1}
                        mask = "places.rating,places.priceLevel,places.userRatingCount"
                        
                        response = await asyncio.to_thread(
                            places_client.search_text,
                            request=request, 
                            metadata=[("x-goog-fieldmask", mask)]
                        )
                        
                        if response.places:
                            place = response.places[0]
                            if getattr(place, "price_level", None):
                                item["price_tier"] = place.price_level.name if hasattr(place.price_level, "name") else place.price_level
                                all_price_levels.append(parse_price_level(item["price_tier"]))
                            if getattr(place, "rating", None):
                                item["rating"] = place.rating
                            if getattr(place, "user_rating_count", None):
                                item["user_rating_count"] = place.user_rating_count
                            changed = True
                    except Exception as e:
                        logger.warning(f"Failed to fetch data for {name}: {e}")

        # 2. Populate the Destination's root price_rating
        if "price_rating" not in dest or changed:
            avg_rating = round(sum(all_price_levels) / len(all_price_levels)) if all_price_levels else 2
            dest["price_rating"] = avg_rating
            changed = True
            logger.info(f"Calculated price_rating {avg_rating} for destination {dest.get('name')}")

        # 3. Save updates to DB
        if changed:
            await destinations_collection.update_one(
                {"_id": dest["_id"]},
                {"$set": dest}
            )
            updated_count += 1
            logger.info(f"Successfully updated missing fields for destination: {dest.get('name')}")

if __name__ == "__main__":
    asyncio.run(populate_missing_fields())
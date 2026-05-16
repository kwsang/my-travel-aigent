import random
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from api.dependencies import get_db

router = APIRouter(prefix="/destinations", tags=["destinations"])

VIBE_EMOJI_MAP = {
    "historic": "🏛️",
    "coastal": "🏖️",
    "romantic": "💖",
    "city": "🏙️",
    "urban": "🏙️",
    "mountain": "⛰️",
    "nature": "🌲",
    "beach": "🏝️",
    "desert": "🏜️",
    "adventure": "🎒",
    "culture": "🎭",
    "food": "🍜",
    "tropical": "🌴",
    "winter": "❄️"
}
DEFAULT_EMOJIS = ["📍", "📸", "🗺️"]

@router.get("/popular")
async def get_popular_destinations(limit: int = 8, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Fetch a random set of destinations from the database."""
    pipeline = [{"$sample": {"size": limit}}]
    destinations = await db.destinations.aggregate(pipeline).to_list(length=limit)
    
    result = []
    for dest in destinations:
        coords = dest.get("location", {}).get("coordinates", [0, 0])
        
        vibe_tags = dest.get("vibe_tags", [])
        emoji = None
        for tag in vibe_tags:
            if tag.lower() in VIBE_EMOJI_MAP:
                emoji = VIBE_EMOJI_MAP[tag.lower()]
                break
                
        if not emoji:
            emoji = random.choice(DEFAULT_EMOJIS)
            
        result.append({
            "name": f"{dest.get('name', 'Unknown')}, {dest.get('state', dest.get('country', ''))}".strip(", "),
            "lat": coords[1],
            "lng": coords[0],
            "emoji": emoji
        })
    return result

@router.get("/by-vibe/{vibe}")
async def get_destinations_by_vibe(vibe: str, skip: int = 0, limit: int = 20, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Fetch destinations that match a specific vibe/tag."""
    # Case-insensitive search using collation for better index performance
    cursor = db.destinations.find({"vibe_tags": vibe}).collation(
        {"locale": "en", "strength": 2}
    ).skip(skip).limit(limit)
    
    destinations = await cursor.to_list(length=limit)
    
    if not destinations:
        return []
        
    for dest in destinations:
        dest["_id"] = str(dest["_id"])
        
    return destinations

@router.get("/{name}")
async def get_destination(name: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Fetch a specific destination by name."""
    search_name = name.split(',')[0].strip()
    
    # Case-insensitive exact match using collation
    dest = await db.destinations.find_one(
        {"name": search_name}, 
        collation={"locale": "en", "strength": 2}
    )
    
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")
        
    dest["_id"] = str(dest["_id"])
    return dest
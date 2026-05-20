import random
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from api.dependencies import get_db
from gemini_agent.tools.discovery import discover_new_destination, _build_destination_query

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
    dest = await db.destinations.find_one(_build_destination_query(name))
    
    if not dest:
        print(f"[API] Destination '{name}' not found. Attempting to auto-seed...")
        seed_result = await discover_new_destination(name)
        print(f"[API] Seed result for '{name}': {seed_result}")
        
        if "SUCCESS" in seed_result or "already in the atlas" in seed_result:
            dest = await db.destinations.find_one(_build_destination_query(name))
    
    if not dest:
        raise HTTPException(status_code=404, detail=f"Destination '{name}' not found and could not be auto-seeded. Result: {seed_result if 'seed_result' in locals() else 'None'}")
        
    dest["_id"] = str(dest["_id"])
    return dest

@router.get("/{name}/stream")
async def stream_destination(name: str, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Server-Sent Events endpoint to stream destination updates to the client.
    """
    async def event_generator():
        last_data_str = None
        idle_time = 0
        MAX_IDLE_TIME = 300  # Close stream after 5 minutes of inactivity

        try:
            while True:
                # Break the loop if the client disconnects (closes the browser tab)
                if await request.is_disconnected():
                    break
                
                dest = await db.destinations.find_one(_build_destination_query(name))
                if dest:
                    dest["_id"] = str(dest["_id"])
                    dest_str = json.dumps(dest)
                    
                    # Only push an event if the destination data has actually changed
                    if dest_str != last_data_str:
                        yield f"data: {dest_str}\n\n"
                        last_data_str = dest_str
                        idle_time = 0
                    else:
                        idle_time += 2.5
                else:
                    idle_time += 2.5

                # Enforce idle timeout
                if idle_time >= MAX_IDLE_TIME:
                    print(f"[API] Stream for {name} closed due to {MAX_IDLE_TIME}s of inactivity.")
                    yield "event: close\ndata: {}\n\n"
                    break
                
                await asyncio.sleep(2.5)  # Poll MongoDB every 2.5 seconds
        except asyncio.CancelledError:
            print(f"[API] Client disconnected from stream for {name}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")
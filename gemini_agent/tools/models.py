from typing import List, Optional, Dict, Literal, Any
from pydantic import BaseModel, Field

class Budget(BaseModel):
    total_limit: float
    currency: str = "USD"

class PartySize(BaseModel):
    adults: int
    children: int = 0

class UserPreferences(BaseModel):
    dietary: List[str] = Field(default_factory=list)
    travel_style: List[str] = Field(default_factory=list)
    preferred_airlines: List[str] = Field(default_factory=list)
    starting_location: str
    target_duration_days: int
    min_rating: float = 4.5
    circadian_preference: str = "standard"
    risk_tolerance: str = "relaxed"
    activity_density: str = "medium"
    transport_preference: str = "neutral"
    personal_transport_available: bool = False
    group_planning_per_person: Optional[bool] = None
    room_sharing: Optional[bool] = None
    people_per_room: Optional[int] = None
    budget: Budget
    party_size: PartySize

class UserProfile(BaseModel):
    user_id: str
    preferences: UserPreferences
    home_airport: Optional[str] = None
    loyalty_programs: Dict[str, str] = Field(default_factory=dict)
    search_history: List[str] = Field(default_factory=list)

class GeoPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float] # [longitude, latitude]

class Destination(BaseModel):
    name: str
    country: str
    description: str
    location: GeoPoint
    vibe_tags: List[str]

class Itinerary(BaseModel):
    user_id: str
    trip_name: str
    duration_days: int
    status: Literal["draft", "final"] = "draft"
    events: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
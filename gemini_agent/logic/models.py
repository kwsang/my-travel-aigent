from pydantic import BaseModel, Field, ConfigDict, field_validator, ValidationInfo
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta

class GeoCoordinates(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    latitude: float = Field(..., description="The latitude coordinate.")
    longitude: float = Field(..., description="The longitude coordinate.")

class Price(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    amount: float = Field(..., description="The numeric cost of the segment.")
    currency: str = Field(default="USD", description="3-letter ISO currency code.")
    is_estimated: bool = Field(default=True, description="Whether the price is a placeholder or confirmed.")

class Schedule(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    local_start_time: str = Field(..., description="ISO 8601 datetime string for local start time (must include date and time).")
    local_end_time: Optional[str] = Field(None, description="ISO 8601 datetime string for local end time.")
    start_time_utc: Optional[str] = Field(None, description="UTC normalized start time.")
    end_time_utc: Optional[str] = Field(None, description="UTC normalized end time.")
    timezone: str = Field(default="America/New_York", description="IANA Timezone ID.")
    estimated_traffic_minutes: Optional[int] = Field(None, description="Raw traffic data from Maps API.")
    applied_buffer_minutes: Optional[int] = Field(None, description="Buffer calculated by validation logic.")

class EventDetails(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(..., description="Display name of the venue or activity.")
    category: str = Field(..., description="Broad category (e.g., Museum, Fine Dining).")
    city: Optional[str] = Field(None, description="Primary city for clustering logic.")
    travel_zone: Optional[str] = Field(None, description="Micro-location zone within a city.")
    geo: Optional[GeoCoordinates] = Field(None, description="Geographic coordinates of the venue or location.")
    price: Optional[Price] = None
    is_rental: bool = Field(default=False, description="True if this is a rental car segment.")
    vehicle_count: int = Field(default=1, description="Number of vehicles for large groups.")

class UserProfilePreferences(BaseModel):
    risk_tolerance: Literal['relaxed', 'strict'] = Field(default='relaxed')
    circadian_preference: Literal['early_bird', 'night_owl'] = Field(default='night_owl')
    group_planning_per_person: bool = Field(default=False)
    transport_preference: Literal['public', 'rideshare', 'rental'] = Field(default='public')
    personal_transport_available: bool = Field(default=False)

class TripBudget(BaseModel):
    total_limit: float = Field(default=0.0)
    currency: str = Field(default="USD")

class TravelerProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    party_size: int = Field(default=1)
    budget: Optional[TripBudget] = None
    preferences: UserProfilePreferences
    room_sharing: bool = Field(default=False)
    people_per_room: int = Field(default=2)
    interests: List[str] = Field(default_factory=list)

class ProfileUpdateRequest(BaseModel):
    party_size: Optional[int] = None
    budget: Optional[TripBudget] = None
    preferences: Optional[UserProfilePreferences] = None
    room_sharing: Optional[bool] = None
    people_per_room: Optional[int] = None
    interests: Optional[List[str]] = None

class Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    day: int = Field(..., description="The sequential day of the trip (1-indexed).")
    segment: Literal["TRANSPORT", "DINING", "EXPERIENCE", "ACCOMMODATION", "LOGISTICS", "FLIGHT"] = Field(..., description="The logistical segment type.")
    schedule: Schedule
    geo: Optional[GeoCoordinates] = Field(None, description="Optional root-level coordinates for transit origins/destinations.")
    details: EventDetails

    @field_validator('schedule', mode='before')
    @classmethod
    def enforce_datetime_format(cls, v, info: ValidationInfo):
        if not isinstance(v, dict):
            return v
        
        day = info.data.get('day', 1)
        base_date = datetime(2026, 1, 1) + timedelta(days=day - 1)
        date_prefix = base_date.strftime("%Y-%m-%d")
        
        for field in ['local_start_time', 'local_end_time']:
            val = v.get(field)
            if val and isinstance(val, str):
                if 'T' not in val:
                    date_part = date_prefix
                    time_part = val.strip()
                else:
                    date_part, time_part = val.split('T', 1)
                
                if len(time_part) <= 5 and time_part.count(':') == 1:
                    time_part += ":00"
                
                parts = time_part.split(':')
                if len(parts[0]) == 1:
                    parts[0] = f"0{parts[0]}"
                v[field] = f"{date_part}T{':'.join(parts)}"
        return v

class Itinerary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str = ""
    session_id: str = ""
    trip_name: str
    destination: Optional[str] = None
    duration_days: int
    party_size_total: int
    status: Literal["draft", "final"] = Field(default="draft")
    events: List[Event]
    budget: Optional[TripBudget] = Field(default_factory=lambda: TripBudget(total_limit=0.0))
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_conflict: bool = Field(default=False, description="True if the itinerary has validation errors.")
    validation_errors: List[str] = Field(default_factory=list, description="List of human-readable rule violations.")
    traveler_profile: Optional[TravelerProfile] = None

    @field_validator('updated_at', mode='before')
    @classmethod
    def serialize_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

class ItineraryPatchRequest(BaseModel):
    events: Optional[List[Event]] = Field(None, description="Updated events from the UI.")
    budget: Optional[TripBudget] = Field(None, description="Updated budget from the UI.")
    destination: Optional[str] = Field(None, description="Manual override for the primary destination.")
    trip_name: Optional[str] = Field(None, description="Manual override for the trip name.")
    status: Optional[Literal["draft", "final"]] = Field(None, description="Manual override for the trip status.")
    traveler_profile: Optional[TravelerProfile] = Field(None, description="Updated traveler profile.")

class ValidationResponse(BaseModel):
    status: Literal["success", "warning", "error"] = Field(..., description="The outcome status of the validation.")
    validation_errors: List[str] = Field(default_factory=list, description="List of human-readable rule violations.")
    itinerary_id: str

class ChatResponse(BaseModel):
    response: str = Field(..., description="The agent's text response.")
    is_conflict: bool = Field(default=False, description="True if the current itinerary has validation errors.")
    itinerary: Optional[Dict[str, Any]] = Field(None, description="The latest itinerary state from the agent.")
    user_profile: Optional[Dict[str, Any]] = Field(None, description="The latest traveler profile state from the agent.")

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user's chat input.")
    user_id: Optional[str] = Field(None, description="The user's ID, optional for anonymous sessions.")
    session_id: str
    user_profile: Optional[Dict[str, Any]] = Field(None, description="The user's traveler profile constraints and preferences.")
    itinerary: Optional[Dict[str, Any]] = Field(None, description="The current itinerary state from the UI.")
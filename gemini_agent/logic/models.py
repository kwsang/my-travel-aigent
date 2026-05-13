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

class UserProfileBudget(BaseModel):
    total_limit: float
    currency: str = Field(default="USD")

class UserProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str = ""
    party_size: int = Field(default=1)
    budget: UserProfileBudget
    preferences: UserProfilePreferences
    room_sharing: bool = Field(default=False)
    people_per_room: int = Field(default=2)
    interests: List[str] = Field(default_factory=list)

class ProfileUpdateRequest(BaseModel):
    """Schema for updating a user profile from the UI."""
    party_size: Optional[int] = None
    budget: Optional[UserProfileBudget] = None
    preferences: Optional[UserProfilePreferences] = None
    room_sharing: Optional[bool] = None
    people_per_room: Optional[int] = None
    group_planning_per_person: Optional[bool] = None
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
            if val and isinstance(val, str) and 'T' not in val:
                time_part = val.strip()
                if len(time_part) <= 5: # HH:MM
                    time_part += ":00"
                v[field] = f"{date_prefix}T{time_part}"
        return v

class Itinerary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str = ""
    session_id: str = ""
    trip_name: str
    duration_days: int
    party_size_total: int
    status: Literal["draft", "final"] = Field(default="draft")
    events: List[Event]
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_conflict: bool = Field(default=False, description="True if the itinerary has validation errors.")
    validation_errors: List[str] = Field(default_factory=list, description="List of human-readable rule violations.")
    user_profile_data: Optional[UserProfile] = None

    @field_validator('updated_at', mode='before')
    @classmethod
    def serialize_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

class ItineraryPatchRequest(BaseModel):
    events: Optional[List[Event]] = Field(None, description="Updated events from the UI.")
    trip_name: Optional[str] = Field(None, description="Manual override for the trip name.")
    status: Optional[Literal["draft", "final"]] = Field(None, description="Manual override for the trip status.")

class ValidationResponse(BaseModel):
    status: Literal["success", "warning", "error"] = Field(..., description="The outcome status of the validation.")
    validation_errors: List[str] = Field(default_factory=list, description="List of human-readable rule violations.")
    itinerary_id: str

class ChatResponse(BaseModel):
    response: str = Field(..., description="The agent's text response.")
    is_conflict: bool = Field(default=False, description="True if the current itinerary has validation errors.")

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user's chat input.")
    user_id: Optional[str] = Field(None, description="The user's ID, optional for anonymous sessions.")
    session_id: str
from pydantic import BaseModel, Field, ConfigDict, field_validator, ValidationInfo, model_validator
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta

class GeoCoordinates(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    latitude: float = Field(..., description="The latitude coordinate.")
    longitude: float = Field(..., description="The longitude coordinate.")

class GeoPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float] # [longitude, latitude]

class Destination(BaseModel):
    name: str
    state: Optional[str] = None
    country: str
    description: str
    location: GeoPoint
    vibe_tags: List[str]
    price_rating: Optional[int] = Field(None, description="Average price rating for the destination (1-4).")
    suggested_lodging: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    suggested_activities: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

class Price(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    amount: float = Field(..., description="The numeric cost of the segment.")
    currency: str = Field(default="USD", description="3-letter ISO currency code.")
    is_estimated: bool = Field(default=True, description="Whether the price is a placeholder or confirmed.")

class Schedule(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    local_start_time: str = Field(..., description="ISO 8601 datetime string for local start time (must include date and time).")
    local_end_time: Optional[str] = Field(None, description="ISO 8601 datetime string for local end time.")
    start_time_utc: Optional[str] = Field(None, description="UTC normalized start time.")
    end_time_utc: Optional[str] = Field(None, description="UTC normalized end time.")
    timezone: str = Field(default="America/New_York", description="IANA Timezone ID (e.g., 'America/Los_Angeles'). You MUST explicitly provide the correct timezone.")
    applied_buffer_minutes: Optional[int] = Field(None, description="Buffer calculated by validation logic.")

class EventDetails(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    name: str = Field(..., description="Display name of the venue or activity.")
    description: Optional[str] = Field(None, description="Description of the venue or event.")
    notes: Optional[str] = Field(None, description="Additional notes or context for the event.")
    image_url: Optional[str] = Field(None, description="Image URL for the venue.")
    category: Optional[str] = Field(None, description="Broad category (e.g., Museum, Fine Dining).")
    city: Optional[str] = Field(None, description="Primary city.")
    travel_zone: Optional[str] = Field(None, description="Micro-location zone within a city.")
    geo: Optional[GeoCoordinates] = Field(None, description="Geographic coordinates of the venue or location.")
    price: Optional[Price] = None
    rating: Optional[float] = Field(None, description="User rating (1.0 to 5.0).")
    user_rating_count: Optional[int] = Field(None, description="Number of user reviews.")
    is_rental: bool = Field(default=False, description="True if this is a rental car segment.")
    vehicle_count: int = Field(default=1, description="Number of vehicles for large groups.")

class UserProfilePreferences(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    risk_tolerance: Literal['relaxed', 'strict'] = Field(default='relaxed')
    circadian_preference: Literal['early_bird', 'night_owl'] = Field(default='night_owl')
    activity_density: Literal['low', 'medium', 'high'] = Field(default='medium')
    group_planning_per_person: bool = Field(default=False)
    transport_preference: Literal['public', 'rideshare', 'rental'] = Field(default='public')
    personal_transport_available: bool = Field(default=False)
    starting_location: Optional[str] = Field(default=None, description="The origin location for the trip.")
    start_date: Optional[str] = Field(default=None, description="Start date in YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="End date in YYYY-MM-DD")
    target_duration_days: Optional[int] = Field(default=None, description="Target trip duration")

class TripBudget(BaseModel):
    total_limit: float = Field(default=0.0)
    currency: str = Field(default="USD")

class TravelerProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    party_size: int = Field(default=1)
    budget: Optional[TripBudget] = Field(default_factory=TripBudget)
    preferences: UserProfilePreferences = Field(default_factory=UserProfilePreferences)
    room_sharing: bool = Field(default=False)
    people_per_room: int = Field(default=2)
    interests: List[str] = Field(default_factory=list)

    @field_validator('party_size', mode='before')
    @classmethod
    def parse_party_size(cls, v):
        if isinstance(v, dict):
            return v.get('adults', 1) + v.get('children', 0)
        return v

class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    party_size: Optional[int] = None
    budget: Optional[TripBudget] = None
    preferences: Optional[UserProfilePreferences] = None
    room_sharing: Optional[bool] = None
    people_per_room: Optional[int] = None
    interests: Optional[List[str]] = None
    starting_location: Optional[str] = Field(default=None, description="Catch-all for UI sending location at the root level")

class Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    day: int = Field(..., description="The sequential day of the trip (1-indexed).")
    segment: Literal["TRANSPORT", "DINING", "EXPERIENCE", "LODGING", "LOGISTICS", "FLIGHT"] = Field(..., description="The logistical segment type.")
    schedule: Schedule
    geo: Optional[GeoCoordinates] = Field(None, description="Optional root-level coordinates for transit origins/destinations.")
    details: EventDetails

    @field_validator('segment', mode='before')
    @classmethod
    def sanitize_segment(cls, v):
        if isinstance(v, str):
            v_upper = v.upper()
            if "DINING" in v_upper or "LUNCH" in v_upper or "DINNER" in v_upper or "BREAKFAST" in v_upper or "BRUNCH" in v_upper:
                return "DINING"
            if "EXPERIENCE" in v_upper or "ACTIVITY" in v_upper:
                return "EXPERIENCE"
            if "LODGING" in v_upper or "HOTEL" in v_upper:
                return "LODGING"
            if "FLIGHT" in v_upper:
                return "FLIGHT"
            if "TRANSPORT" in v_upper or "DRIVE" in v_upper:
                return "TRANSPORT"
            if "LOGISTIC" in v_upper:
                return "LOGISTICS"
        return v

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
        
        # Auto-generate local_end_time if the LLM omitted it
        if v.get('local_start_time') and not v.get('local_end_time'):
            try:
                start_dt = datetime.strptime(v['local_start_time'], "%Y-%m-%dT%H:%M:%S")
                
                # Dynamically set default duration based on the already-validated segment type
                segment_type = info.data.get('segment', '')
                if segment_type == "DINING":
                    duration_hours = 2
                elif segment_type == "EXPERIENCE":
                    duration_hours = 3
                else:
                    duration_hours = 1  # Default fallback for TRANSPORT, LODGING, etc.
                    
                end_dt = start_dt + timedelta(hours=duration_hours)
                v['local_end_time'] = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                pass
                
        return v
        
    @model_validator(mode='after')
    def correct_dining_segment(self) -> 'Event':
        if self.segment == "EXPERIENCE" and self.details and self.details.category:
            cat = self.details.category.lower()
            if any(word in cat for word in ['lunch', 'dinner', 'breakfast', 'brunch', 'dining', 'food', 'meal', 'restaurant']):
                self.segment = "DINING"
        return self

class Itinerary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    user_id: str = ""
    session_id: str = ""
    trip_name: str
    destination: Optional[str] = None
    lodging: Optional[Dict[str, Any]] = Field(None, description="The selected lodging for the trip.")
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

    @model_validator(mode='after')
    def enrich_lodging_events(self) -> 'Itinerary':
        if self.lodging and self.events:
            lodging_geo = self.lodging.get("geo")
            lodging_rating = self.lodging.get("rating")
            lodging_reviews = self.lodging.get("user_rating_count")
            lodging_description = self.lodging.get("description")
            lodging_image_url = self.lodging.get("image_url") or self.lodging.get("photo_url")
            
            for event in self.events:
                if event.segment == "LODGING":
                    if lodging_geo:
                        if not event.geo:
                            event.geo = GeoCoordinates(**lodging_geo) if isinstance(lodging_geo, dict) else lodging_geo
                        if not event.details.geo:
                            event.details.geo = GeoCoordinates(**lodging_geo) if isinstance(lodging_geo, dict) else lodging_geo
                    if lodging_rating is not None and event.details.rating is None:
                        event.details.rating = float(lodging_rating)
                    if lodging_reviews is not None and event.details.user_rating_count is None:
                        event.details.user_rating_count = int(lodging_reviews)
                    if lodging_description and not event.details.description:
                        event.details.description = lodging_description
                    if lodging_image_url and not event.details.image_url:
                        event.details.image_url = lodging_image_url
                    if self.destination and not event.details.city:
                        event.details.city = self.destination.split(',')[0].strip()
        return self

class ItineraryPatchRequest(BaseModel):
    events: Optional[List[Event]] = Field(None, description="Updated events from the UI.")
    budget: Optional[TripBudget] = Field(None, description="Updated budget from the UI.")
    destination: Optional[str] = Field(None, description="Manual override for the primary destination.")
    lodging: Optional[Dict[str, Any]] = Field(None, description="Manual override for the lodging.")
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
    itinerary: Optional[Itinerary] = Field(None, description="The latest itinerary state from the agent.")
    traveler_profile: Optional[TravelerProfile] = Field(None, description="The latest traveler profile state from the agent.")

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user's chat input.")
    user_id: Optional[str] = Field(None, description="The user's ID, optional for anonymous sessions.")
    session_id: str
    traveler_profile: Optional[Dict[str, Any]] = Field(None, description="The user's traveler profile constraints and preferences.")
    itinerary: Optional[Dict[str, Any]] = Field(None, description="The current itinerary state from the UI.")
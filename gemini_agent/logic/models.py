from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone

class PriceModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    amount: float = Field(..., description="The numeric cost of the segment.")
    currency: str = Field(default="USD", description="3-letter ISO currency code.")
    is_estimated: bool = Field(default=True, description="Whether the price is a placeholder or confirmed.")

class ScheduleModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    local_start_time: str = Field(..., description="ISO 8601 string for local start time.")
    local_end_time: Optional[str] = Field(None, description="ISO 8601 string for local end time.")
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
    price: Optional[PriceModel] = None
    is_rental: bool = Field(default=False, description="True if this is a rental car segment.")
    vehicle_count: int = Field(default=1, description="Number of vehicles for large groups.")

class EventModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    day: int = Field(..., description="The sequential day of the trip (1-indexed).")
    segment: Literal["TRANSPORT", "DINING", "EXPERIENCE", "ACCOMMODATION", "LOGISTICS", "FLIGHT"] = Field(..., description="The logistical segment type.")
    schedule: ScheduleModel
    details: EventDetails

class ItineraryModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str
    session_id: str
    trip_name: str
    duration_days: int
    party_size_total: int
    events: List[EventModel]
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_conflict: bool = Field(default=False, description="True if the itinerary has validation errors.")
    validation_errors: List[str] = Field(default_factory=list, description="List of human-readable rule violations.")

class ItineraryPatchRequest(BaseModel):
    events: List[EventModel] = Field(..., description="The complete set of updated events from the UI.")

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
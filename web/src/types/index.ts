/**
 * Core Itinerary Data Models
 */
export interface PriceModel {
  amount: number;
  currency: string;
  is_estimated: boolean;
}

export interface ScheduleModel {
  local_start_time: string;
  local_end_time?: string;
  start_time_utc?: string;
  end_time_utc?: string;
  timezone: string;
  estimated_traffic_minutes?: number;
  applied_buffer_minutes?: number;
}

export interface EventDetails {
  name: string;
  category: string;
  city?: string;
  travel_zone?: string;
  price?: PriceModel;
  is_rental: boolean;
  vehicle_count: number;
}

export interface EventModel {
  day: number;
  segment: "TRANSPORT" | "DINING" | "EXPERIENCE" | "ACCOMMODATION" | "LOGISTICS" | "FLIGHT";
  schedule: ScheduleModel;
  details: EventDetails;
}

export interface ItineraryModel {
  _id?: string;
  user_id: string;
  session_id: string;
  trip_name: string;
  duration_days: number;
  party_size_total: number;
  events: EventModel[];
  updated_at: string;
  is_conflict: boolean;
  validation_errors: string[];
}

/**
 * API Request/Response Models
 */
export interface ItineraryPatchRequest {
  events: EventModel[];
}

/**
 * Matches the ChatRequest model in server.py
 */
export interface ChatRequest {
  user_id: string;
  session_id: string;
  message: string;
  state_delta?: Record<string, any>;
}

/**
 * Matches the ChatResponse model in server.py
 */
export interface ChatResponse {
  text?: string;
  response?: string; // Matches the field name returned by server.py
  thought?: string; // model thoughts for UI debugging
  role: "user" | "model" | "system";
  /** True if the current itinerary has validation errors. */
  is_conflict?: boolean; // Made optional to support local "user" messages
}

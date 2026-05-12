import { Event, Itinerary } from "./models";

/**
 * API Request/Response Models
 * Used for communication with the FastAPI backend.
 */

export interface ItineraryPatchRequest {
  events?: Event[];
  trip_name?: string;
  status?: 'draft' | 'final';
}

export interface ChatRequest {
  user_id?: string;
  session_id: string;
  message: string;
}

export interface ChatResponse {
  response: string;
  is_conflict: boolean;
}
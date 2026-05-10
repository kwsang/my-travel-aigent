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

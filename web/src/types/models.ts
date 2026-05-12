export interface Price {
  amount: number;
  currency: string;
  is_estimated: boolean;
}

export interface Schedule {
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
  price?: Price;
  is_rental: boolean;
  vehicle_count: number;
}

export type SegmentType =
  | "TRANSPORT"
  | "DINING"
  | "EXPERIENCE"
  | "ACCOMMODATION"
  | "LOGISTICS"
  | "FLIGHT";

export interface Event {
  day: number;
  segment: SegmentType;
  schedule: Schedule;
  details: EventDetails;
}

export interface Itinerary {
  _id?: string;
  user_id: string;
  session_id: string;
  trip_name: string;
  duration_days: number;
  party_size_total: number;
  events: Event[];
  updated_at: string;
  is_conflict: boolean;
  validation_errors: string[];
  user_profile_data?: UserProfile;
}

export interface UserProfile {
  user_id: string;
  party_size: number;
  budget: {
    total_limit: number;
    currency: string;
  };
  preferences: {
    risk_tolerance: 'relaxed' | 'strict';
    circadian_preference: 'early_bird' | 'night_owl';
    group_planning_per_person?: boolean;
  };
}
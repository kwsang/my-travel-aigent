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

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface EventDetails {
  name: string;
  description?: string;
  notes?: string;
  image_url?: string;
  category: string;
  city?: string;
  travel_zone?: string;
  geo?: GeoCoordinates;
  price?: Price;
  rating?: number;
  user_rating_count?: number;
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
  geo?: GeoCoordinates;
  details: EventDetails;
}

export interface Budget {
  total_limit: number;
  currency: string;
}

export interface Itinerary {
  _id?: string;
  user_id: string;
  session_id: string;
  trip_name: string;
  duration_days: number;
  party_size_total: number;
  events: Event[];
  budget?: Budget;
  status?: 'draft' | 'final';
  destination?: string; // Add this line!
  accommodation?: any;
  updated_at: string;
  is_conflict: boolean;
  validation_errors: string[];
  traveler_profile?: TravelerProfile;
}

export interface TravelerProfile {
  party_size: number;
  budget?: Budget;
  preferences: {
    risk_tolerance: 'relaxed' | 'strict';
    circadian_preference: 'early_bird' | 'night_owl';
    group_planning_per_person?: boolean;
    starting_location?: string;
    transport_preference?: 'public' | 'rideshare' | 'rental';
    personal_transport_available?: boolean;
    start_date?: string;
    end_date?: string;
    target_duration_days?: number;
  };
  room_sharing?: boolean;
  people_per_room?: number;
  interests?: string[];
}
/**
 * Shared Profile Types
 * Used for form state management and profile data synchronization.
 */

export interface ProfileFormData {
  party_size: number;
  room_sharing: boolean;
  people_per_room: number;
  budget: {
    total_limit: number;
    currency: string;
  };
  preferences: {
    risk_tolerance: 'relaxed' | 'strict';
    circadian_preference: 'night_owl' | 'early_bird';
    group_planning_per_person: boolean;
    transport_preference: 'public' | 'rideshare' | 'rental';
    personal_transport_available: boolean;
  };
  interests: string[];
}
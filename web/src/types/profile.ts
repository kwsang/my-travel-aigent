/**
 * Shared Profile Types
 * Used for form state management and profile data synchronization.
 */

import { Budget } from './models';

export interface ProfileFormData {
  party_size: number;
  room_sharing: boolean;
  people_per_room: number;
  budget: Budget;
  preferences: {
    risk_tolerance: 'relaxed' | 'strict';
    circadian_preference: 'night_owl' | 'early_bird';
    activity_density: 'low' | 'medium' | 'high';
    group_planning_per_person: boolean;
    transport_preference: 'public' | 'rideshare' | 'rental';
    personal_transport_available: boolean;
    starting_location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    target_duration_days?: number | null;
  };
  interests: string[];
}
import { TravelerProfile } from '@/types';
import { ProfileFormData } from '@/types/profile';

export const parseProfileData = (data?: TravelerProfile): ProfileFormData => ({
  party_size: data?.party_size || 1,
  room_sharing: data?.room_sharing || false,
  people_per_room: data?.people_per_room || 2,
  budget: data?.budget || { total_limit: 0, currency: 'USD' },
  preferences: {
    risk_tolerance: data?.preferences?.risk_tolerance || 'relaxed',
    circadian_preference: data?.preferences?.circadian_preference || 'night_owl',
    activity_density: data?.preferences?.activity_density || 'medium',
    group_planning_per_person: data?.preferences?.group_planning_per_person || false,
    transport_preference: data?.preferences?.transport_preference || 'rental',
    personal_transport_available: data?.preferences?.personal_transport_available || false,
    starting_location: data?.preferences?.starting_location ?? undefined,
    start_date: data?.preferences?.start_date ?? undefined,
    end_date: data?.preferences?.end_date ?? undefined,
    target_duration_days: data?.preferences?.target_duration_days ?? undefined,
    min_rating: data?.preferences?.min_rating ?? null
  },
  interests: data?.interests || [],
  home_airport: data?.home_airport ?? null,
  loyalty_programs: data?.loyalty_programs || {},
  search_history: data?.search_history || []
});
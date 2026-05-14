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
    group_planning_per_person: data?.preferences?.group_planning_per_person || false,
    transport_preference: data?.preferences?.transport_preference || 'rental',
    personal_transport_available: data?.preferences?.personal_transport_available || false
  },
  interests: data?.interests || []
});
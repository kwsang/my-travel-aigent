/**
 * Global Application Configuration
 */

export const BUDGET_CONFIG = {
  // The percentage at which the UI starts showing warnings
  WARNING_THRESHOLD: 90,
  DEFAULT_CURRENCY: 'USD',
  MIN_PARTY_SIZE: 1,
};

export const PROFILE_OPTIONS = {
  // Matches UserProfilePreferencesModel.risk_tolerance
  RISK_TOLERANCES: [
    { value: 'relaxed', label: 'Relaxed' },
    { value: 'strict', label: 'Strict' },
  ],
  // Matches UserProfilePreferencesModel.circadian_preference
  CIRCADIAN_PREFERENCES: [
    { value: 'night_owl', label: 'Night Owl' },
    { value: 'early_bird', label: 'Early Bird' },
    { value: 'morning_person', label: 'Morning Person' },
  ],
  TRANSPORT_OPTIONS: [
    { value: 'public', label: 'Public Transit' },
    { value: 'rideshare', label: 'Rideshare' },
    { value: 'rental', label: 'Rental Car' },
  ],
  TRAVEL_INTERESTS: [
    'Nature', 'Culture', 'Food', 'Adventure', 'Relaxation', 'Shopping', 'History', 'Art', 'Nightlife', 'Sports'
  ],
};

export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
};

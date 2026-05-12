/**
 * Global Application Configuration
 */

export const BUDGET_CONFIG = {
  // The percentage at which the UI starts showing warnings
  WARNING_THRESHOLD: 90,
  DEFAULT_CURRENCY: 'USD',
  MIN_PARTY_SIZE: 1,
};

export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
};

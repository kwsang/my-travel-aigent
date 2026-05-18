import type { components } from './generated-api';

export type Price = components['schemas']['Price'];
export type Schedule = components['schemas']['Schedule'];
export type GeoCoordinates = components['schemas']['GeoCoordinates'];
export type EventDetails = components['schemas']['EventDetails'] & { photo_url?: string; google_maps_uri?: string; notes?: string; };
export type Budget = components['schemas']['TripBudget'];
export type TravelerProfile = components['schemas']['TravelerProfile'];

export interface Destination {
  name: string;
  state?: string | null;
  country: string;
  description: string;
  location: { type: 'Point'; coordinates: number[] };
  vibe_tags: string[];
  price_rating?: number | null;
  suggested_lodging?: any[];
  suggested_activities?: any[];
}

export type Event = components['schemas']['Event'] & { image_url?: string; google_maps_uri?: string; };
export type Itinerary = components['schemas']['Itinerary'] & { _id?: string; };

export type SegmentType = components['schemas']['Event']['segment'];

export type PriceLevel = 
  | 'PRICE_LEVEL_UNSPECIFIED'
  | 'PRICE_LEVEL_FREE'
  | 'PRICE_LEVEL_INEXPENSIVE'
  | 'PRICE_LEVEL_MODERATE'
  | 'PRICE_LEVEL_EXPENSIVE'
  | 'PRICE_LEVEL_VERY_EXPENSIVE'
  | 0 | 1 | 2 | 3 | 4;

export interface SuggestionPlace {
  name?: string;
  displayName?: { text: string };
  location?: any;
  geo?: GeoCoordinates;
  details?: Partial<EventDetails> & { types?: string[]; priceLevel?: PriceLevel };
  price?: any;
  priceLevel?: PriceLevel;
  price_level?: PriceLevel;
  price_tier?: PriceLevel;
  rating?: number;
  userRatingCount?: number;
  user_rating_count?: number;
  user_ratings_total?: number;
  image_url?: string;
  photo_url?: string;
  photoUri?: string;
  photos?: Array<{ photoUri?: string; name?: string }>;
  google_maps_uri?: string;
  types?: string[];
  _suggestionType?: 'destination' | 'lodging' | 'activity';
  [key: string]: any;
}
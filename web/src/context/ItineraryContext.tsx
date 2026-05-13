import React, { createContext, useContext } from 'react';
import { Itinerary } from '@/types';

export interface ItineraryContextType {
  itinerary: Partial<Itinerary>;
  setItinerary: React.Dispatch<React.SetStateAction<Partial<Itinerary>>>;
  viewMode: 'total' | 'per_person';
  setViewMode: React.Dispatch<React.SetStateAction<'total' | 'per_person'>>;
  refreshDashboard: () => void;
  sessionId: string;
  userId: string;
  isLoading?: boolean;
  activeSegmentIndex: number | null;
  setActiveSegmentIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

export const ItineraryContext = createContext<ItineraryContextType | undefined>(undefined);

export function useItinerary() {
  const context = useContext(ItineraryContext);
  if (context === undefined) {
    throw new Error('useItinerary must be used within an ItineraryContext.Provider');
  }
  return context;
}

// Extended hook to automatically extract and fall back deeply nested values
export function useItineraryData() {
  const context = useItinerary();
  const { itinerary } = context;

  const segments = itinerary.events || [];
  const profile = itinerary.traveler_profile;
  const partySize = profile?.party_size || 1;
  const budget = itinerary.budget;
  const riskTolerance = profile?.preferences?.risk_tolerance;
  const isRelaxed = riskTolerance === 'relaxed';

  return {
    ...context,
    segments, profile, partySize, budget, riskTolerance, isRelaxed
  };
}
import React, { createContext, useContext } from 'react';
import { Itinerary } from '@/types';

export interface ItineraryContextType {
  itinerary: Partial<Itinerary>;
  setItinerary: React.Dispatch<React.SetStateAction<Partial<Itinerary>>>;
  viewMode: 'total' | 'per_person';
  setViewMode: React.Dispatch<React.SetStateAction<'total' | 'per_person'>>;
  refreshDashboard: () => void;
}

export const ItineraryContext = createContext<ItineraryContextType | undefined>(undefined);

export function useItinerary() {
  const context = useContext(ItineraryContext);
  if (context === undefined) {
    throw new Error('useItinerary must be used within an ItineraryContext.Provider');
  }
  return context;
}
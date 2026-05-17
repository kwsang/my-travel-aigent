import React, { createContext, useContext } from 'react';

interface MapContextType {
  handleSelectDestination: (destName: string) => Promise<void>;
  handleSelectLodging: (placeData: any) => Promise<void>;
  handleAddActivity: (placeName: string, eventCategory: string) => void;
  handleMapAddLodging: (place: any) => void;
  setActiveSuggestion: (suggestion: any) => void;
  formatPrice: (p: any) => string | null;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export function MapProvider({ children, value }: { children: React.ReactNode; value: MapContextType }) {
  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
}
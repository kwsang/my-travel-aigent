'use client';

import React from 'react';
import { Map as MapIcon, MapPin, Navigation, AlertTriangle } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';
import { GoogleMap, useJsApiLoader, useGoogleMap, Polyline, InfoWindow } from '@react-google-maps/api';

// Extracted outside the component to prevent infinite re-renders in useJsApiLoader
const MAPS_LIBRARIES: ("marker" | "places")[] = ["marker"];

// Workaround for React 18 type conflicts with @react-google-maps/api
const MapComponent = GoogleMap as any;
const PolylineComponent = Polyline as any;
const InfoWindowComponent = InfoWindow as any;

/**
 * Custom Advanced Marker Component
 * Leverages google.maps.marker.AdvancedMarkerElement and PinElement
 */
function AdvancedSegmentMarker({ position, title, segmentType, isActive, onClick }: { position: google.maps.LatLngLiteral, title: string, segmentType: string, isActive: boolean, onClick: () => void }) {
  const map = useGoogleMap();

  React.useEffect(() => {
    if (!map || !window.google) return;

    let bgColor = '#6366f1'; // Default primary
    let glyph = '📍';
    
    switch(segmentType) {
      case 'ACCOMMODATION': bgColor = '#8b5cf6'; glyph = '🏨'; break; // Violet
      case 'DINING': bgColor = '#f43f5e'; glyph = '🍽️'; break; // Rose
      case 'EXPERIENCE': bgColor = '#f59e0b'; glyph = '✨'; break; // Amber
      case 'FLIGHT': bgColor = '#0ea5e9'; glyph = '✈️'; break; // Sky
      case 'TRANSPORT': bgColor = '#0ea5e9'; glyph = '🚗'; break; // Sky
      case 'LOGISTICS': bgColor = '#64748b'; glyph = '📋'; break; // Slate
    }

    const pin = new google.maps.marker.PinElement({
      background: bgColor,
      borderColor: isActive ? '#020617' : '#ffffff', // High contrast dark border when active
      glyph: glyph,
      scale: isActive ? 1.4 : 1.1, // Scale up when active
    });

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      title,
      content: pin.element,
      zIndex: isActive ? 100 : undefined, // Bring to front
    });

    // AdvancedMarkerElements use 'gmp-click' instead of standard 'click'
    const listener = marker.addListener('gmp-click', onClick);

    return () => {
      listener.remove();
      marker.map = null;
    };
  }, [map, position, title, segmentType, isActive, onClick]);

  return null;
}

/**
 * MapHub Component
 * Visualizes itinerary segments on a geographic workspace.
 */
export default function MapHub() {
  const { segments, profile, isRelaxed, activeSegmentIndex, setActiveSegmentIndex } = useItineraryData();
  const selectedSegment = activeSegmentIndex !== null ? (segments[activeSegmentIndex] as any) : null;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

  // Extract destination from the events
  const cities = Array.from(new Set(segments.map((s) => s.details?.city).filter(Boolean)));
  const primaryDestination = cities.length > 0 ? cities[0] : 'Destination TBD';
  
  // Extract starting location from profile preferences (populated by the Concierge agent)
  const startingLocation = (profile?.preferences as any)?.starting_location;

  // Load the Google Maps script
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: MAPS_LIBRARIES
  });

  // Determine the map center based on the first segment with coordinates, defaulting to NYC
  const defaultCenter = { lat: 40.7128, lng: -74.0060 };
  const centerSegment = segments.find((s: any) => s.geo || s.details?.geo) as any;
  const mapCenter = centerSegment ? (centerSegment.geo || centerSegment.details?.geo) : defaultCenter;

  // Generate the sequential path for the polyline
  const routePath = React.useMemo(() => {
    return segments
      .map((segment: any) => {
        const geo = segment.geo || segment.details?.geo;
        if (!geo) return null;
        return { lat: geo.latitude || geo.lat, lng: geo.longitude || geo.lng };
      })
      .filter(Boolean) as google.maps.LatLngLiteral[];
  }, [segments]);

  // Store the map instance to interact with its API natively
  const [mapInstance, setMapInstance] = React.useState<google.maps.Map | null>(null);

  // Automatically fit bounds to contain all markers when routePath changes
  React.useEffect(() => {
    if (mapInstance && routePath.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      routePath.forEach((pos) => bounds.extend(pos));
      // Add padding to ensure markers aren't hidden behind the ChatInterface or BudgetPanel
      mapInstance.panToBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 }); 
    }
  }, [mapInstance, routePath]);

  return (
    <div className="relative h-full w-full bg-background overflow-hidden">
      {/* Google Map */}
      {isLoaded ? (
        <MapComponent
          mapContainerClassName="w-full h-full"
          center={{ lat: mapCenter.latitude || mapCenter.lat, lng: mapCenter.longitude || mapCenter.lng }}
          zoom={11}
          options={{
            disableDefaultUI: true, // Hides standard controls for a cleaner, modern look
            zoomControl: true,
            mapId: 'DEMO_MAP_ID', // Required for AdvancedMarkerElements
          }}
          onLoad={setMapInstance}
          onUnmount={() => setMapInstance(null)}
        >
          {segments.map((segment: any, index: number) => {
            const geo = segment.geo || segment.details?.geo;
            if (geo) {
              return (
                <AdvancedSegmentMarker
                  key={`${segment.day}-${index}`} 
                  position={{ lat: geo.latitude, lng: geo.longitude }} 
                  title={segment.details?.name}
                  segmentType={segment.segment}
                  isActive={activeSegmentIndex === index}
                  onClick={() => setActiveSegmentIndex(index)}
                />
              );
            }
            return null;
          })}

          {/* Info Window */}
          {selectedSegment && (() => {
            const geo = selectedSegment.geo || selectedSegment.details?.geo;
            if (!geo) return null;
            
            return (
              <InfoWindowComponent
                position={{ lat: geo.latitude, lng: geo.longitude }}
                onCloseClick={() => setActiveSegmentIndex(null)}
              >
                {/* Using hardcoded text colors because InfoWindows don't automatically adapt to app-level dark mode */}
                <div className="p-1 max-w-[200px] text-slate-900">
                  <h3 className="font-bold text-sm mb-0.5 leading-tight">{selectedSegment.details?.name}</h3>
                  <p className="text-xs text-slate-600 mb-1">{selectedSegment.details?.category}</p>
                  {selectedSegment.schedule?.local_start_time && (
                    <p className="text-[11px] font-semibold text-indigo-600">
                      {selectedSegment.schedule.local_start_time}
                    </p>
                  )}
                </div>
              </InfoWindowComponent>
            );
          })()}

          {/* Polyline Route */}
          {routePath.length > 1 && (
            <PolylineComponent
              path={routePath}
              options={{
                strokeColor: '#6366f1', // Matches the primary theme color
                strokeOpacity: 0.8,
                strokeWeight: 4,
                geodesic: true,
              }}
            />
          )}
        </MapComponent>
      ) : (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      )}

      {/* Location Overlay */}
      <div className="absolute top-6 left-6 z-20 flex flex-col items-start gap-2 pointer-events-none animate-in fade-in slide-in-from-left-4 duration-500">
        <div className="flex items-center gap-3 bg-card/90 backdrop-blur-xl border border-white/10 px-4 py-3 rounded-2xl shadow-xl ring-1 ring-black/5">
          <div className="bg-primary/20 p-2 rounded-full">
            <MapPin className="w-4 h-4 text-primary drop-shadow-sm" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">Destination</span>
            <span className="text-base font-black text-foreground tracking-tight leading-none">{primaryDestination as React.ReactNode}</span>
          </div>
        </div>
        
        {startingLocation && (
          <div className="flex items-center gap-2 bg-card/60 backdrop-blur-md border border-white/5 px-3 py-1.5 rounded-xl ml-2 shadow-sm">
            <Navigation className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Starting from <span className="text-foreground font-bold">{startingLocation as React.ReactNode}</span>
            </span>
          </div>
        )}
      </div>

      {/* Loading State / Fallback UI */}
      {!isLoaded && !loadError && apiKey && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="rounded-full bg-card p-4 shadow-xl border border-border">
              <MapIcon className="w-8 h-8 text-primary/40 animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-foreground/60 uppercase tracking-widest text-xs">Loading Workspace...</h3>
            </div>
          </div>
        </div>
      )}

      {/* Error / Missing API Key State */}
      {(!apiKey || loadError) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-destructive p-6 rounded-2xl bg-card border border-destructive/10 shadow-xl">
            <AlertTriangle className="w-8 h-8 text-destructive/80" />
            <div className="text-center">
              <h3 className="font-bold uppercase tracking-widest text-xs mb-1">Map Unavailable</h3>
              <p className="text-xs font-medium opacity-80">{!apiKey ? "Google Maps API key is missing." : "Failed to load Google Maps."}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

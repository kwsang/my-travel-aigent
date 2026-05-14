'use client';

import React from 'react';
import { Map as MapIcon, MapPin, Navigation, AlertTriangle } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';
import { APIProvider, Map, useMap, useApiIsLoaded } from '@vis.gl/react-google-maps';
import AdvancedSegmentMarker from './map/AdvancedSegmentMarker';

// Extracted outside the component to prevent infinite re-renders in useJsApiLoader
const MAPS_LIBRARIES: ("marker" | "places")[] = ["marker"];

// Custom Google Maps theme matching the "Deep Twilight" dark UI
const twilightMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#13111c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#13111c" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b8698" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c4b5fd" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8b8698" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#1b1829" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b6580" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#252138" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2f2a47" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8b8698" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#363052" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#463f68" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c4b5fd" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#252138" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c4b5fd" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0b0914" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#463f68" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#13111c" }],
  },
];

/**
 * MapHub Component
 * Visualizes itinerary segments on a geographic workspace.
 */
export default function MapHub() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

  if (!apiKey) {
    return (
      <div className="relative h-full w-full bg-background overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-destructive p-6 rounded-2xl bg-card border border-destructive/10 shadow-xl">
            <AlertTriangle className="w-8 h-8 text-destructive/80" />
            <div className="text-center">
              <h3 className="font-bold uppercase tracking-widest text-xs mb-1">Map Unavailable</h3>
              <p className="text-xs font-medium opacity-80">Google Maps API key is missing.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-background overflow-hidden">
      {/* Using `any` cast on libraries as @vis.gl types can sometimes conflict with native arrays */}
      <APIProvider apiKey={apiKey} libraries={MAPS_LIBRARIES as any}>
        <MapInner />
      </APIProvider>
    </div>
  );
}

function MapInner() {
  const { segments, profile, isRelaxed, activeSegmentIndex, setActiveSegmentIndex, itinerary } = useItineraryData();
  const map = useMap();
  const isLoaded = useApiIsLoaded();

  // Extract starting location from profile preferences (populated by the Concierge agent)
  const startingLocation = profile?.preferences?.starting_location;

  // Extract destination from the events (prioritizing non-transit segments to avoid origin airports)
  const nonTransitSegments = segments.filter((s) => !['FLIGHT', 'TRANSPORT'].includes(s.segment));
  const targetSegments = nonTransitSegments.length > 0 ? nonTransitSegments : segments;
  const cities = Array.from(new Set(targetSegments.map((s) => s.details?.city).filter(Boolean)));
  const destinationCities = cities.filter(city => city !== startingLocation);
  const tripName = itinerary?.trip_name && itinerary.trip_name !== 'New Trip' ? itinerary.trip_name : null;
  const primaryDestination = destinationCities.length > 0 ? destinationCities[0] : (cities.length > 0 ? cities[0] : (tripName || 'Destination TBD'));

  // Memoize the map center so it doesn't cause the map to re-pan on every context render
  const mapCenter = React.useMemo(() => {
    const defaultCenter = { lat: 39.8283, lng: -98.5795 };
    const centerSegment = segments.find((s) => s.geo || s.details?.geo);
    const raw: any = centerSegment?.geo || centerSegment?.details?.geo || defaultCenter;
    return { lat: raw.latitude || raw.lat, lng: raw.longitude || raw.lng };
  }, [segments]);

  // Generate the sequential path for the polyline
  const routePath = React.useMemo(() => {
    return segments
      .map((segment) => {
        const geo = segment.geo || segment.details?.geo;
        if (!geo) return null;
        return { lat: geo.latitude, lng: geo.longitude };
      })
      .filter(Boolean) as google.maps.LatLngLiteral[];
  }, [segments]);

  // Generate individual edges for the polyline to style flights differently
  const routeEdges = React.useMemo(() => {
    const edges: { path: google.maps.LatLngLiteral[], options: any }[] = [];
    const validSegments = segments.filter((s) => s.geo || s.details?.geo);
    
    for (let i = 1; i < validSegments.length; i++) {
      const prev = validSegments[i - 1];
      const curr = validSegments[i];
      const prevGeo = prev.geo || prev.details?.geo;
      const currGeo = curr.geo || curr.details?.geo;
      
      if (prevGeo && currGeo) {
        edges.push({
          path: [
            { lat: prevGeo.latitude, lng: prevGeo.longitude },
            { lat: currGeo.latitude, lng: currGeo.longitude }
          ],
          options: {
            strokeColor: curr.segment === 'FLIGHT' ? '#0ea5e9' : '#6366f1',
            strokeOpacity: curr.segment === 'FLIGHT' ? 0 : 0.8,
            strokeWeight: 4,
            geodesic: true,
            icons: curr.segment === 'FLIGHT' ? [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3 },
              offset: '0',
              repeat: '15px'
            }] : undefined,
          }
        });
      }
    }
    return edges;
  }, [segments]);

  // Stable callback for marker clicks to prevent breaking memoization
  const handleMarkerClick = React.useCallback((index: number) => {
    setActiveSegmentIndex(index);
  }, [setActiveSegmentIndex]);

  // Automatically fit bounds or pan to active segment
  React.useEffect(() => {
    if (!map) return;

    if (activeSegmentIndex !== null && segments[activeSegmentIndex]) {
      const activeSegment = segments[activeSegmentIndex];
      const isTransport = ['FLIGHT', 'TRANSPORT'].includes(activeSegment.segment);

      let prevGeo: { latitude: number; longitude: number } | null | undefined = null;
      let nextGeo = activeSegment.geo || activeSegment.details?.geo;

      if (isTransport) {
        // Try to find the previous location
        for (let i = activeSegmentIndex - 1; i >= 0; i--) {
          const s = segments[i];
          const geo = s.geo || s.details?.geo;
          if (geo) {
            prevGeo = geo;
            break;
          }
        }
        // If the transport segment itself doesn't have a geo, find the next one
        if (!nextGeo) {
          for (let i = activeSegmentIndex + 1; i < segments.length; i++) {
            const s = segments[i];
            const geo = s.geo || s.details?.geo;
            if (geo) {
              nextGeo = geo;
              break;
            }
          }
        }
      }

      if (isTransport && prevGeo && nextGeo) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend({ lat: prevGeo!.latitude, lng: prevGeo!.longitude });
        bounds.extend({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.panToBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 });
      } else if (nextGeo) {
        map.panTo({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.setZoom(15);
      }
    } else if (routePath.length > 0) {
      // Zoom to fit all if no active segment is selected
      if (routePath.length === 1) {
        map.panTo(routePath[0]);
        map.setZoom(14); // Sensible default zoom for a single marker
      } else {
        const bounds = new window.google.maps.LatLngBounds();
        routePath.forEach((pos) => bounds.extend(pos));
        map.fitBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 }); 
      }
    }
  }, [map, activeSegmentIndex, routePath, segments]);

  return (
    <>
      {isLoaded ? (
        <Map
          className="w-full h-full"
          defaultCenter={mapCenter}
          defaultZoom={segments.length === 0 ? 4 : 11}
          disableDefaultUI={true}
          zoomControl={true}
          mapId="DEMO_MAP_ID"
          styles={twilightMapStyle}
          colorScheme={"DARK" as any}
        >
          {segments.map((segment, index: number) => {
            const geo = segment.geo || segment.details?.geo;
            if (geo) {
              return (
                <AdvancedSegmentMarker
                  key={`${segment.day}-${index}`} 
                  position={{ lat: geo.latitude, lng: geo.longitude }} 
                  title={segment.details?.name}
                  segmentType={segment.segment}
                  isActive={activeSegmentIndex === index}
                  index={index}
                  onClick={handleMarkerClick}
                />
              );
            }
            return null;
          })}

          {/* Polyline Routes */}
          {routeEdges.map((edge, index) => (
            <RoutePolyline
              key={`route-edge-${index}`}
              path={edge.path}
              options={edge.options}
            />
          ))}
        </Map>
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
      {!isLoaded && (
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
    </>
  );
}

// Custom Polyline wrapper since @vis.gl/react-google-maps doesn't provide a <Polyline> natively
function RoutePolyline({ path, options }: { path: google.maps.LatLngLiteral[], options: any }) {
  const map = useMap();
  const polylineRef = React.useRef<google.maps.Polyline | null>(null);

  React.useEffect(() => {
    if (!map) return;
    if (!polylineRef.current) {
      polylineRef.current = new window.google.maps.Polyline({ ...options, path });
      polylineRef.current.setMap(map);
    } else {
      polylineRef.current.setOptions(options);
      polylineRef.current.setPath(path);
    }
  }, [map, path, options]);

  React.useEffect(() => {
    return () => {
      if (polylineRef.current) polylineRef.current.setMap(null);
    };
  }, []);

  return null;
}

'use client';

import React from 'react';
import { Map as MapIcon, MapPin, Navigation, AlertTriangle, Home } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';
import { APIProvider, Map, useMap, useApiIsLoaded, AdvancedMarker } from '@vis.gl/react-google-maps';
import RoutePolyline from './RoutePolyline';
import { marineSunsetMapStyle } from '@/config/mapStyles';
import { Event } from '@/types';
import { API_CONFIG } from '@/config/constants';
import { SegmentType, SegmentColors } from '@/components/dashboard/utils/segmentMapping';

// Extracted outside the component to prevent infinite re-renders in useJsApiLoader
const MAPS_LIBRARIES: ("marker" | "places")[] = ["marker"];

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
  const { segments, profile, isRelaxed, activeSegmentIndex, setActiveSegmentIndex, itinerary, setItinerary, hoveredSegmentIndex, setHoveredSegmentIndex } = useItineraryData();
  const map = useMap();
  const isLoaded = useApiIsLoaded();

  const [popularDestinations, setPopularDestinations] = React.useState<{name: string; lat: number; lng: number; emoji: string}[]>([]);

  const [destinationInfo, setDestinationInfo] = React.useState<any>(null);

  const [hoveredPopularIndex, setHoveredPopularIndex] = React.useState<number | null>(null);
  const hoveredPopularIndexRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    hoveredPopularIndexRef.current = hoveredPopularIndex;
  }, [hoveredPopularIndex]);

  React.useEffect(() => {
    if (itinerary.destination) {
      fetch(`${API_CONFIG.BASE_URL}/destinations/${encodeURIComponent(itinerary.destination)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setDestinationInfo(data))
        .catch(err => console.error("Failed to load destination info", err));
    } else {
      setDestinationInfo(null);
    }
  }, [itinerary.destination]);

  const fetchPopular = React.useCallback(() => {
    fetch(`${API_CONFIG.BASE_URL}/destinations/popular`)
      .then(res => res.json())
      .then(data => setPopularDestinations(data))
      .catch(err => console.error("Failed to load popular destinations", err));
  }, []);

  React.useEffect(() => {
    if (segments.length === 0 && !itinerary.destination) {
      fetchPopular();
      const intervalId = setInterval(() => {
        if (hoveredPopularIndexRef.current === null) {
          fetchPopular();
        }
      }, 8000); // Refresh every 8 seconds, pausing if hovered
      return () => clearInterval(intervalId);
    }
  }, [segments.length, itinerary.destination, fetchPopular]);

  // Extract starting location from profile preferences (populated by the Concierge agent)
  const startingLocation = profile?.preferences?.starting_location;

  // Extract destination from the events (prioritizing non-transit segments to avoid origin airports)
  const nonTransitSegments = segments.filter((s: Event) => !['FLIGHT', 'TRANSPORT'].includes(s.segment));
  const targetSegments = nonTransitSegments.length > 0 ? nonTransitSegments : segments;
  const cities = Array.from(new Set(targetSegments.map((s: Event) => s.details?.city).filter(Boolean)));
  const destinationCities = cities.filter((city: any) => city !== startingLocation);
  const primaryDestination = destinationCities.length > 0 ? destinationCities[0] : (cities.length > 0 ? cities[0] : (itinerary.destination || 'Destination TBD'));

  const [startGeo, setStartGeo] = React.useState<{ lat: number, lng: number } | null>(null);

  React.useEffect(() => {
    if (!isLoaded || !startingLocation) {
      setStartGeo(null);
      return;
    }

    const geocoder = new (window as any).google.maps.Geocoder();
    geocoder.geocode({ address: startingLocation }, (results: any, status: any) => {
      if (status === 'OK' && results && results.length > 0) {
        setStartGeo({
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng()
        });
      } else {
        setStartGeo(null);
      }
    });
  }, [isLoaded, startingLocation]);

  // Memoize the map center so it doesn't cause the map to re-pan on every context render
  const mapCenter = React.useMemo(() => {
    const defaultCenter = { lat: 39.8283, lng: -98.5795 }; // Center on continental US
    const centerSegment = segments.find((s: Event) => s.geo || s.details?.geo);
    const geo = centerSegment?.geo || centerSegment?.details?.geo || itinerary.accommodation?.geo || itinerary.accommodation?.details?.geo || itinerary.accommodation?.location;
    if (geo) {
      return { lat: geo.latitude, lng: geo.longitude };
    }
    
    if (!itinerary.accommodation && destinationInfo?.suggested_accommodations && destinationInfo.suggested_accommodations.length > 0) {
      const firstSugg = destinationInfo.suggested_accommodations[0];
      const suggGeo = firstSugg.geo || firstSugg.details?.geo || firstSugg.location;
      if (suggGeo) {
        return { lat: suggGeo.latitude, lng: suggGeo.longitude };
      }
    }

    if (destinationInfo?.suggested_activities && destinationInfo.suggested_activities.length > 0) {
      const firstSugg = destinationInfo.suggested_activities[0];
      const suggGeo = firstSugg.geo || firstSugg.details?.geo || firstSugg.location;
      if (suggGeo) {
        return { lat: suggGeo.latitude, lng: suggGeo.longitude };
      }
    }

    const dest = popularDestinations.find(d => d.name === itinerary.destination);
    if (dest) {
      return { lat: dest.lat, lng: dest.lng };
    }
    return defaultCenter;
  }, [segments, itinerary.destination, itinerary.accommodation, popularDestinations, destinationInfo?.suggested_accommodations, destinationInfo?.suggested_activities]);

  // Create a stable signature of all geographic points to display on the map.
  // This prevents the map from re-fitting its bounds unless the actual coordinates of markers change.
  const geoSignature = React.useMemo(() => {
    const getCoords = (item: any): string | null => {
      if (!item) return null;
      const geo = item.geo || item.details?.geo || item.location;
      // Using toFixed to prevent minor floating point differences from triggering re-renders
      return geo ? `${geo.latitude.toFixed(5)},${geo.longitude.toFixed(5)}` : null;
    };

    const coords: (string | null)[] = [];

    // Add coordinates from all potential marker sources
    segments.forEach(s => coords.push(getCoords(s)));
    if (itinerary.accommodation) {
      coords.push(getCoords(itinerary.accommodation));
    }
    destinationInfo?.suggested_accommodations?.forEach((p: any) => coords.push(getCoords(p)));
    destinationInfo?.suggested_activities?.forEach((p: any) => coords.push(getCoords(p)));

    if (startGeo) {
      coords.push(`${startGeo.lat.toFixed(5)},${startGeo.lng.toFixed(5)}`);
    }

    // Sort to ensure order doesn't matter, then stringify for a stable dependency.
    return JSON.stringify(coords.filter(Boolean).sort());
  }, [segments, itinerary.accommodation, destinationInfo, startGeo]);

  // Generate the sequential path for the polyline
  const routePath = React.useMemo(() => {
    const path: { lat: number; lng: number }[] = [];
    if (startGeo) {
      path.push(startGeo);
    }
    segments.forEach((segment: Event) => {
      const geo = segment.geo || segment.details?.geo;
      if (geo) {
        path.push({ lat: geo.latitude, lng: geo.longitude });
      }
    });
    return path;
  }, [segments, startGeo]);

  // Generate individual edges for the polyline to style flights differently
  const routeEdges = React.useMemo(() => {
    const edges: { path: { lat: number; lng: number }[], options: any }[] = [];
    const validSegments = segments.filter((s: Event) => s.geo || s.details?.geo);
    
    if (startGeo && validSegments.length > 0) {
      const firstSegment = validSegments[0];
      const firstGeo = firstSegment.geo || firstSegment.details?.geo;
      if (firstGeo) {
        edges.push({
          path: [
            startGeo,
            { lat: firstGeo.latitude, lng: firstGeo.longitude }
          ],
          options: {
            strokeColor: SegmentColors[firstSegment.segment as SegmentType]?.bg || (firstSegment.segment === 'FLIGHT' ? '#296eb4' : '#fdb833'),
            strokeOpacity: firstSegment.segment === 'FLIGHT' ? 0 : 0.8,
            strokeWeight: 4,
            geodesic: true,
            icons: firstSegment.segment === 'FLIGHT' ? [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3 },
              offset: '0',
              repeat: '15px'
            }] : undefined,
          }
        });
      }
    }

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
            strokeColor: SegmentColors[curr.segment as SegmentType]?.bg || (curr.segment === 'FLIGHT' ? '#296eb4' : '#fdb833'),
            strokeOpacity: curr.segment === 'FLIGHT' ? 0 : 0.8,
            strokeWeight: 4,
            geodesic: true,
            icons: curr.segment === 'FLIGHT' ? [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3 },
              offset: '0',
              repeat: '15px'
            }] : undefined,
          }
        });
      }
    }
    return edges;
  }, [segments, startGeo]);

  // Automatically fit bounds or pan to active segment
  React.useEffect(() => {
    if (!map || !isLoaded) return;

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
        const bounds = new (window as any).google.maps.LatLngBounds();
        bounds.extend({ lat: prevGeo!.latitude, lng: prevGeo!.longitude });
        bounds.extend({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.panToBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 });
      } else if (nextGeo) {
        map.panTo({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.setZoom(15);
      }
    } else if (routePath.length > 0 || itinerary.accommodation || (!itinerary.accommodation && destinationInfo?.suggested_accommodations?.length) || destinationInfo?.suggested_activities?.length) {
      // Zoom to fit all segments and suggestions if no active segment is selected
      const bounds = new (window as any).google.maps.LatLngBounds();
      let pointCount = 0;
      let lastPoint: { lat: number; lng: number } | null = null;

      routePath.forEach((pos) => {
        bounds.extend(pos);
        pointCount++;
        lastPoint = pos;
      });

      if (itinerary.accommodation) {
        const geo = itinerary.accommodation.geo || itinerary.accommodation.details?.geo || itinerary.accommodation.location;
        if (geo) {
          const pos = { lat: geo.latitude, lng: geo.longitude };
          bounds.extend(pos);
          pointCount++;
          lastPoint = pos;
        }
      }

      if (!itinerary.accommodation) {
        destinationInfo?.suggested_accommodations?.forEach((place: any) => {
          const geo = place.geo || place.details?.geo || place.location;
          if (geo) {
            const pos = { lat: geo.latitude, lng: geo.longitude };
            bounds.extend(pos);
            pointCount++;
            lastPoint = pos;
          }
        });
      }

      destinationInfo?.suggested_activities?.forEach((place: any) => {
        const geo = place.geo || place.details?.geo || place.location;
        if (geo) {
          const pos = { lat: geo.latitude, lng: geo.longitude };
          bounds.extend(pos);
          pointCount++;
          lastPoint = pos;
        }
      });

      if (pointCount === 1 && lastPoint) {
        map.panTo(lastPoint);
        map.setZoom(14); // Sensible default zoom for a single marker
      } else if (pointCount > 1) {
        map.fitBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 }); 
      }
    } else if (segments.length === 0 && !itinerary.accommodation) {
      const dest = popularDestinations.find(d => d.name === itinerary.destination);
      if (dest) {
        map.panTo({ lat: dest.lat, lng: dest.lng });
        map.setZoom(11);
      } else {
        map.setZoom(4);
        map.panTo({ lat: 39.8283, lng: -98.5795 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, activeSegmentIndex, geoSignature]);

  return (
    <>
      {isLoaded ? (
        <Map
          className="w-full h-full"
          defaultCenter={mapCenter}
          defaultZoom={segments.length === 0 && !itinerary.destination ? 4 : 11}
          disableDefaultUI={true}
          zoomControl={true}
          mapId="DEMO_MAP_ID"
          styles={marineSunsetMapStyle}
          colorScheme={"DARK" as any}
        >
          {startGeo && (
            <AdvancedMarker
              position={startGeo}
              title={`Starting from ${startingLocation}`}
            >
              <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500">
                <div className="relative bg-slate-700 border-2 border-white shadow-xl rounded-full w-8 h-8 flex items-center justify-center mb-1 group-hover:border-slate-400 group-hover:shadow-slate-500/30 transition-all">
                  <Home size={14} className="text-white" />
                </div>
                <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
                  Start: {startingLocation as React.ReactNode}
                </div>
              </div>
            </AdvancedMarker>
          )}

          {/* Popular Destinations Markers */}
          {segments.length === 0 && !itinerary.destination && popularDestinations.map((dest, idx) => (
            <AdvancedMarker
              key={`popular-${dest.name}-${idx}`}
              position={{ lat: dest.lat, lng: dest.lng }}
              title={dest.name}
              onClick={() => setItinerary?.(prev => ({ ...prev, destination: dest.name }))}
              onMouseEnter={() => setHoveredPopularIndex(idx)}
              onMouseLeave={() => setHoveredPopularIndex(null)}
              zIndex={hoveredPopularIndex === idx ? 100 : 1}
            >
              <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500 cursor-pointer">
                <div className="bg-card border border-white/20 shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-primary group-hover:shadow-primary/20 transition-colors">
                  {dest.emoji}
                </div>
                <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-foreground/80 border border-white/10 whitespace-nowrap pointer-events-none shadow-lg">
                  {dest.name}
                </div>
              </div>
            </AdvancedMarker>
          ))}

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
            <span className="text-base font-black text-foreground tracking-tight leading-none hover:bg-accent hover:text-accent-foreground px-1.5 py-0.5 -ml-1.5 rounded-md transition-colors duration-200 cursor-default pointer-events-auto">{primaryDestination as React.ReactNode}</span>
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

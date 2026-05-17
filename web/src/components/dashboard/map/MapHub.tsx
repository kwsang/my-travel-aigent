'use client';

import React from 'react';
import { Map as MapIcon, MapPin, Navigation, AlertTriangle, Home, Bed, Utensils, Star, Sparkles, Plus } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';
import { APIProvider, Map, useMap, useApiIsLoaded, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import RoutePolyline from './RoutePolyline';
import { marineSunsetMapStyle } from '@/config/mapStyles';
import { Event } from '@/types';
import { API_CONFIG } from '@/config/constants';
import { SegmentType, SegmentColors, SegmentIcons } from '@/components/dashboard/utils/segmentMapping';

// Extracted outside the component to prevent infinite re-renders in useJsApiLoader
const MAPS_LIBRARIES: ("marker" | "places" | "geometry")[] = ["marker", "geometry"];

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
  const { segments, profile, isRelaxed, activeSegmentIndex, setActiveSegmentIndex, itinerary, setItinerary, hoveredSegmentIndex, setHoveredSegmentIndex, sessionId, userId } = useItineraryData();
  const map = useMap();
  const isLoaded = useApiIsLoaded();

  // Helper to format mixed price representations from the API
  const formatPrice = (p: any) => {
    if (!p) return null;
    if (typeof p === 'object' && p !== null) {
      return `${p.currency === 'USD' ? '$' : (p.currency ? p.currency + ' ' : '')}${p.amount}`;
    }
    const s = String(p);
    if (s === 'PRICE_LEVEL_FREE' || s === '0') return 'Free';
    if (s === 'PRICE_LEVEL_INEXPENSIVE' || s === '1') return '$';
    if (s === 'PRICE_LEVEL_MODERATE' || s === '2') return '$$';
    if (s === 'PRICE_LEVEL_EXPENSIVE' || s === '3') return '$$$';
    if (s === 'PRICE_LEVEL_VERY_EXPENSIVE' || s === '4') return '$$$$';
    return s;
  };

  const [popularDestinations, setPopularDestinations] = React.useState<{name: string; lat: number; lng: number; emoji: string}[]>([]);

  const [destinationInfo, setDestinationInfo] = React.useState<any>(null);

  const [hoveredPopularIndex, setHoveredPopularIndex] = React.useState<number | null>(null);
  const hoveredPopularIndexRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    hoveredPopularIndexRef.current = hoveredPopularIndex;
  }, [hoveredPopularIndex]);

  const [activeSuggestion, setActiveSuggestion] = React.useState<any>(null);

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
        if (hoveredPopularIndexRef.current === null && document.visibilityState === 'visible') {
          fetchPopular();
        }
      }, 15000); // Refresh every 15 seconds, pausing if hovered
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

    if (destinationInfo?.location?.coordinates) {
      return { lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] };
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
    segments.forEach(s => {
      coords.push(getCoords(s));
      const details = s.details as typeof s.details & { polyline?: string };
      if (details?.polyline) coords.push(details.polyline);
    });
    if (itinerary.accommodation) {
      coords.push(getCoords(itinerary.accommodation));
    }
    destinationInfo?.suggested_accommodations?.forEach((p: any) => coords.push(getCoords(p)));
    destinationInfo?.suggested_activities?.forEach((p: any) => coords.push(getCoords(p)));

    if (startGeo) {
      coords.push(`${startGeo.lat.toFixed(5)},${startGeo.lng.toFixed(5)}`);
    }

    if (destinationInfo?.location?.coordinates) {
      coords.push(`${destinationInfo.location.coordinates[1].toFixed(5)},${destinationInfo.location.coordinates[0].toFixed(5)}`);
    }

    // Sort to ensure order doesn't matter, then stringify for a stable dependency.
    return JSON.stringify(coords.filter(Boolean).sort());
  }, [segments, itinerary.accommodation, destinationInfo, startGeo]);

  // Generate individual edges for the polyline to style flights differently
  const routeEdges = React.useMemo(() => {
    const edges: { path: { lat: number; lng: number }[], options: any }[] = [];
    
    // A palette of distinct, vibrant colors for overlapping routes
    const routePalette = [
      '#1789fc', // Primary Blue
      '#fdb833', // Accent Gold
      '#10b981', // Emerald
      '#ec4899', // Pink
      '#8b5cf6', // Violet
      '#f43f5e', // Rose
      '#06b6d4', // Cyan
      '#eab308'  // Yellow
    ];

    const getOptions = (segment: Event, edgeIndex: number) => {
      const details = segment.details as typeof segment.details & { travel_mode?: string };
      const mode = details?.travel_mode || (segment.segment === 'FLIGHT' ? 'FLIGHT' : 'DRIVE');
      let strokeOpacity = 0.8;
      let strokeWeight = 4;
      let icons = undefined;

      if (segment.segment === 'FLIGHT' || mode === 'FLIGHT') {
        strokeOpacity = 0;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3 }, offset: '0', repeat: '15px' }];
      } else if (mode === 'WALK' || mode === 'BICYCLE') {
        strokeOpacity = 0;
        strokeWeight = 3;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 2 }, offset: '0', repeat: '10px' }];
      } else if (mode === 'TRANSIT') {
        strokeOpacity = 0;
        strokeWeight = 5;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 4 }, offset: '0', repeat: '20px' }];
      }

      return {
        strokeColor: routePalette[edgeIndex % routePalette.length],
        strokeOpacity,
        strokeWeight,
        geodesic: true,
        icons
      };
    };
    let lastValidGeo: { lat: number; lng: number } | null = null;
    let edgeCounter = 0;

      segments.forEach((curr) => {
        const currDetails = curr.details as typeof curr.details & { polyline?: string };
        const currGeo = curr.geo || curr.details?.geo;
        
        let path: { lat: number; lng: number }[] = [];

        if (currDetails?.polyline && (window as any).google?.maps?.geometry?.encoding) {
          try {
            const decoded = (window as any).google.maps.geometry.encoding.decodePath(currDetails.polyline);
            path = decoded.map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
          } catch (e) {}
        } else if (lastValidGeo && currGeo) {
        path = [
          lastValidGeo,
          { lat: currGeo.latitude, lng: currGeo.longitude }
        ];
      }

      if (path.length > 0) {

        edges.push({
          path: path,
          options: getOptions(curr, edgeCounter++)
        });
      }
      if (currGeo) {
        lastValidGeo = { lat: currGeo.latitude, lng: currGeo.longitude };
      } else if (path.length > 0) {
        lastValidGeo = path[path.length - 1];
      }
        });
    return edges;
      }, [segments]);

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
        if (!prevGeo && startGeo) {
          prevGeo = { latitude: startGeo.lat, longitude: startGeo.lng };
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
        
        const details = activeSegment.details as any;
        if (details?.polyline && (window as any).google?.maps?.geometry?.encoding) {
          try {
            const decoded = (window as any).google.maps.geometry.encoding.decodePath(details.polyline);
            decoded.forEach((p: any) => bounds.extend(p));
          } catch(e) {}
        }
        
        map.panToBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 });
      } else if (nextGeo) {
        map.panTo({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.setZoom(15);
      }
    } else if (segments.length > 0 || itinerary.accommodation || (!itinerary.accommodation && destinationInfo?.suggested_accommodations?.length) || destinationInfo?.suggested_activities?.length || (itinerary.destination && destinationInfo?.location?.coordinates)) {
      // Zoom to fit all segments and suggestions if no active segment is selected
      const bounds = new (window as any).google.maps.LatLngBounds();
      let pointCount = 0;
      let lastPoint: { lat: number; lng: number } | null = null;

      segments.forEach((segment: Event) => {
        if (['FLIGHT', 'TRANSPORT'].includes(segment.segment)) return; // Exclude transit segments from general overview bounds
        const geo = segment.geo || segment.details?.geo;
        if (geo) {
          const pos = { lat: geo.latitude, lng: geo.longitude };
          bounds.extend(pos);
          pointCount++;
          lastPoint = pos;
        }
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

      if (itinerary.destination && destinationInfo?.location?.coordinates) {
        const pos = { lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] };
        bounds.extend(pos);
        pointCount++;
        lastPoint = pos;
      }

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
              onClick={async () => {
                console.log(`[MapHub] Popular destination clicked: ${dest.name}`);
                const isDefaultName = !itinerary.trip_name || itinerary.trip_name === 'New Trip';
                const newItinerary = { 
                  ...itinerary, 
                  destination: dest.name,
                  ...(isDefaultName ? { trip_name: `${dest.name} Trip` } : {})
                };
                setItinerary?.(newItinerary);
                
                if (sessionId && userId) {
                  try {
                    await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}?user_id=${userId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newItinerary),
                    });
                  } catch (e) {
                    console.error("Failed to instantly save destination", e);
                  }
                }
                console.log(`[MapHub] Dispatching 'travel_aigent_set_destination' event...`);
                window.dispatchEvent(new CustomEvent('travel_aigent_set_destination', { detail: dest.name }));
              }}
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

          {/* Selected Destination Marker */}
          {itinerary.destination && destinationInfo?.location?.coordinates && (
            <AdvancedMarker
              position={{ lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] }}
              title={itinerary.destination}
            >
              <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500 cursor-default">
                <div className="bg-primary/90 border-2 border-white/20 shadow-xl rounded-full w-12 h-12 flex items-center justify-center text-2xl mb-1 transition-colors">
                  📍
                </div>
                <div className="bg-background/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold tracking-wider uppercase text-foreground/90 border border-primary/40 whitespace-nowrap pointer-events-none shadow-lg">
                  {itinerary.destination}
                </div>
              </div>
            </AdvancedMarker>
          )}

          {/* Suggested Accommodations */}
          {!!itinerary.destination && !itinerary.accommodation && destinationInfo?.suggested_accommodations?.map((place: any, idx: number) => {
            const geo = place.geo || place.details?.geo || place.location;
            if (!geo) return null;
            
            const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Place';
            const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
            const rating = place.details?.rating || place.rating;
            const ratingCount = place.details?.user_rating_count || place.userRatingCount || place.user_rating_count;

            return (
                <AdvancedMarker
                    key={`suggestion-acc-${idx}`}
                    position={{ lat: geo.latitude, lng: geo.longitude }}
                    title={placeName}
                    onClick={() => {
                        setActiveSuggestion({ ...place, _suggestionType: 'accommodation' });
                        setActiveSegmentIndex(null as any);
                    }}
                >
                    <div className="flex flex-col items-center group animate-in fade-in zoom-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                        <div className="relative bg-violet-500 border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-violet-300 group-hover:shadow-violet-500/30 transition-all">
                            <Bed size={18} className="text-white" />
                            {(price || rating) && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
                                    {price && (
                                        <span>{formatPrice(price)}</span>
                                    )}
                                    {price && rating && <span className="opacity-70">•</span>}
                                    {rating && (
                                        <span className="flex items-center gap-0.5">
                                            <Star size={9} className="fill-white" /> 
                                            {rating}
                                            {ratingCount && <span className="text-[8px] font-medium opacity-80">({ratingCount})</span>}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
                            {placeName}
                        </div>
                    </div>
                </AdvancedMarker>
            );
          })}

          {/* Suggested Activities */}
          {!!itinerary.destination && destinationInfo?.suggested_activities?.map((place: any, idx: number) => {
            const geo = place.geo || place.details?.geo || place.location;
            if (!geo) return null;
            
            const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Activity';
            const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
            const rating = place.details?.rating || place.rating;
            const ratingCount = place.details?.user_rating_count || place.userRatingCount || place.user_rating_count;

            return (
                <AdvancedMarker
                    key={`suggestion-act-${idx}`}
                    position={{ lat: geo.latitude, lng: geo.longitude }}
                    title={placeName}
                    onClick={() => {
                        setActiveSuggestion({ ...place, _suggestionType: 'activity' });
                        setActiveSegmentIndex(null as any);
                    }}
                >
                    <div className="flex flex-col items-center group animate-in fade-in zoom-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                        <div className="relative bg-amber-500 border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-amber-300 group-hover:shadow-amber-500/30 transition-all">
                            <Utensils size={18} className="text-white" />
                            {(price || rating) && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
                                    {price && (
                                        <span>{formatPrice(price)}</span>
                                    )}
                                    {price && rating && <span className="opacity-70">•</span>}
                                    {rating && (
                                        <span className="flex items-center gap-0.5">
                                            <Star size={9} className="fill-white" /> 
                                            {rating}
                                            {ratingCount && <span className="text-[8px] font-medium opacity-80">({ratingCount})</span>}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
                            {placeName}
                        </div>
                    </div>
                </AdvancedMarker>
            );
          })}

          {/* Timeline Segments */}
          {segments.map((segment: Event, index: number) => {
            const geo = segment.geo || segment.details?.geo;
            if (!geo) return null;
            
            const placeName = segment.details?.name || 'Unnamed Event';
            const price = segment.details?.price;
            const rating = segment.details?.rating;
            const ratingCount = segment.details?.user_rating_count;
            const isHovered = hoveredSegmentIndex === index;
            const isActive = activeSegmentIndex === index;

            return (
              <AdvancedMarker
                key={`${segment.day}-${index}`} 
                position={{ lat: geo.latitude, lng: geo.longitude }} 
                title={placeName}
                onClick={() => {
                  setActiveSegmentIndex(index);
                  setActiveSuggestion(null);
                }}
                zIndex={isActive || isHovered ? 100 : 10}
              >
                <div 
                  className="flex flex-col items-center group cursor-pointer"
                  onMouseEnter={() => setHoveredSegmentIndex?.(index)}
                  onMouseLeave={() => setHoveredSegmentIndex?.(null)}
                >
                  <div className="relative border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 transition-all" style={{ backgroundColor: SegmentColors[segment.segment as SegmentType]?.bg || '#fdb833' }}>
                    <div className="text-white scale-75">
                      {React.createElement(SegmentIcons[segment.segment as SegmentType] || Sparkles, { className: 'w-6 h-6' })}
                    </div>
                    {(price || rating) && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
                            {price && <span>{formatPrice(price)}</span>}
                            {price && rating && <span className="opacity-70">•</span>}
                            {rating && (
                                <span className="flex items-center gap-0.5">
                                    <Star size={9} className="fill-white" /> 
                                    {rating}
                                    {ratingCount && <span className="text-[8px] font-medium opacity-80">({ratingCount})</span>}
                                </span>
                            )}
                        </div>
                    )}
                  </div>
                  <div className={`bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 whitespace-nowrap shadow-lg transition-opacity ${isActive || isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {placeName}
                  </div>
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Polyline Routes */}
          {routeEdges.map((edge, index) => (
            <RoutePolyline
              key={`route-edge-${index}`}
              path={edge.path}
              options={edge.options}
            />
          ))}

          {/* Active Segment Info Window */}
          {activeSegmentIndex !== null && segments[activeSegmentIndex] && (
            (() => {
              const activeSegment = segments[activeSegmentIndex];
              const geo = activeSegment.geo || activeSegment.details?.geo;
              if (!geo) return null;
              const placeName = activeSegment.details?.name || 'Unnamed Event';
              const description = activeSegment.details?.description;
              const notes = activeSegment.details?.notes;
              const price = activeSegment.details?.price;
              const rating = activeSegment.details?.rating;
              const imageUrl = activeSegment.details?.image_url || (activeSegment as any).image_url || (activeSegment.details as any)?.photo_url;
              return (
                <InfoWindow
                  position={{ lat: geo.latitude, lng: geo.longitude }}
                  onCloseClick={() => setActiveSegmentIndex(null as any)}
                >
                  <div className="flex flex-col gap-1 p-1 max-w-[200px] text-gray-900">
                    {imageUrl && (
                      <div className="w-full h-24 mb-1 rounded-sm overflow-hidden bg-muted relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl as string} alt={placeName as string} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <h3 className="font-bold text-sm leading-tight mb-1">{placeName as React.ReactNode}</h3>
                    {description && <p className="text-xs opacity-80">{description as React.ReactNode}</p>}
                    {notes && <p className="text-xs opacity-80 italic mt-1">Note: {notes as React.ReactNode}</p>}
                    {(price || rating) && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 text-xs font-semibold">
                        {price && <span>{formatPrice(price)}</span>}
                        {price && rating && <span className="opacity-50">•</span>}
                        {rating && <span className="flex items-center gap-0.5"><Star size={10} className="fill-amber-500 text-amber-500" /> {rating as React.ReactNode}</span>}
                      </div>
                    )}
                  </div>
                </InfoWindow>
              );
            })()
          )}

          {/* Active Suggestion Info Window */}
          {activeSuggestion && (
            (() => {
              const place = activeSuggestion;
              const geo = place.geo || place.details?.geo || place.location;
              if (!geo) return null;
              const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Place';
              const description = place.details?.description;
              const notes = place.details?.notes;
              const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
              const rating = place.details?.rating || place.rating;
              const imageUrl = place.details?.image_url || place.image_url || place.photo_url || place.photoUri || (place.photos && place.photos.length > 0 ? place.photos[0].photoUri || place.photos[0].name : null);
              return (
                <InfoWindow
                  position={{ lat: geo.latitude, lng: geo.longitude }}
                  onCloseClick={() => setActiveSuggestion(null)}
                >
                  <div className="flex flex-col gap-1 p-1 max-w-[200px] text-gray-900">
                    {imageUrl && (
                      <div className="w-full h-24 mb-1 rounded-sm overflow-hidden bg-muted relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl as string} alt={placeName as string} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <h3 className="font-bold text-sm leading-tight mb-1">{placeName as React.ReactNode}</h3>
                    {description && <p className="text-xs opacity-80">{description as React.ReactNode}</p>}
                    {notes && <p className="text-xs opacity-80 italic mt-1">Note: {notes as React.ReactNode}</p>}
                    {(price || rating) && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 text-xs font-semibold">
                        {price && <span>{formatPrice(price)}</span>}
                        {price && rating && <span className="opacity-50">•</span>}
                        {rating && <span className="flex items-center gap-0.5"><Star size={10} className="fill-amber-500 text-amber-500" /> {rating as React.ReactNode}</span>}
                      </div>
                    )}
                    <button
                      className="mt-2 w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-bold py-1.5 px-3 rounded-md hover:bg-primary/90 transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        if (place._suggestionType === 'accommodation') {
                          setItinerary?.((prev: any) => ({
                            ...prev,
                            accommodation: place
                          }));
                        } else {
                          const newEvent = {
                            segment: 'EXPERIENCE',
                            day: 1, // Add to Day 1 by default, the user can reorganize it via drag & drop
                            details: {
                              ...place.details,
                              name: placeName,
                              description: description,
                              notes: notes,
                              image_url: imageUrl,
                              geo: geo,
                              price: price,
                              rating: rating,
                            }
                          };
                          setItinerary?.((prev: any) => ({
                            ...prev,
                            events: [...(prev.events || []), newEvent]
                          }));
                        }
                        
                        setActiveSuggestion(null);
                      }}
                    >
                      <Plus size={14} /> Add to Itinerary
                    </button>
                  </div>
                </InfoWindow>
              );
            })()
          )}
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

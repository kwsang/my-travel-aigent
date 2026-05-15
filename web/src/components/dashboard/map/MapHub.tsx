'use client';

import React from 'react';
import { Map as MapIcon, MapPin, Navigation, AlertTriangle, Bed, Star, Utensils } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';
import { APIProvider, Map, useMap, useApiIsLoaded, AdvancedMarker } from '@vis.gl/react-google-maps';
import AdvancedSegmentMarker from './AdvancedSegmentMarker';
import RoutePolyline from './RoutePolyline';
import { marineSunsetMapStyle } from '@/config/mapStyles';
import { Event } from '@/types';
import { API_CONFIG } from '@/config/constants';

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

  React.useEffect(() => {
    if (segments.length === 0 && popularDestinations.length === 0) {
      fetch(`${API_CONFIG.BASE_URL}/destinations/popular`)
        .then(res => res.json())
        .then(data => setPopularDestinations(data))
        .catch(err => console.error("Failed to load popular destinations", err));
    }
  }, [segments.length, popularDestinations.length]);

  // Extract starting location from profile preferences (populated by the Concierge agent)
  const startingLocation = profile?.preferences?.starting_location;

  // Extract destination from the events (prioritizing non-transit segments to avoid origin airports)
  const nonTransitSegments = segments.filter((s: Event) => !['FLIGHT', 'TRANSPORT'].includes(s.segment));
  const targetSegments = nonTransitSegments.length > 0 ? nonTransitSegments : segments;
  const cities = Array.from(new Set(targetSegments.map((s: Event) => s.details?.city).filter(Boolean)));
  const destinationCities = cities.filter((city: any) => city !== startingLocation);
  const primaryDestination = destinationCities.length > 0 ? destinationCities[0] : (cities.length > 0 ? cities[0] : (itinerary.destination || 'Destination TBD'));

  // Memoize the map center so it doesn't cause the map to re-pan on every context render
  const mapCenter = React.useMemo(() => {
    const defaultCenter = { lat: 39.8283, lng: -98.5795 }; // Center on continental US
    const centerSegment = segments.find((s: Event) => s.geo || s.details?.geo);
    const geo = centerSegment?.geo || centerSegment?.details?.geo;
    if (geo) {
      return { lat: geo.latitude, lng: geo.longitude };
    }
    
    if (itinerary.suggested_accommodations && itinerary.suggested_accommodations.length > 0) {
      const firstSugg = itinerary.suggested_accommodations[0];
      const suggGeo = firstSugg.geo || firstSugg.details?.geo || firstSugg.location;
      if (suggGeo) {
        return { lat: suggGeo.latitude, lng: suggGeo.longitude };
      }
    }

    if (itinerary.suggested_activities && itinerary.suggested_activities.length > 0) {
      const firstSugg = itinerary.suggested_activities[0];
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
  }, [segments, itinerary.destination, popularDestinations, itinerary.suggested_accommodations, itinerary.suggested_activities]);

  // Generate the sequential path for the polyline
  const routePath = React.useMemo(() => {
    return segments
      .map((segment: Event) => {
        const geo = segment.geo || segment.details?.geo;
        if (!geo) return null;
        return { lat: geo.latitude, lng: geo.longitude };
      })
      .filter(Boolean) as { lat: number; lng: number }[];
  }, [segments]);

  // Generate individual edges for the polyline to style flights differently
  const routeEdges = React.useMemo(() => {
    const edges: { path: { lat: number; lng: number }[], options: any }[] = [];
    const validSegments = segments.filter((s: Event) => s.geo || s.details?.geo);
    
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
            strokeColor: curr.segment === 'FLIGHT' ? '#296eb4' : '#fdb833',
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
  }, [segments]);

  // Stable callback for marker clicks to prevent breaking memoization
  const handleMarkerClick = React.useCallback((index: number) => {
    setActiveSegmentIndex(index);
  }, [setActiveSegmentIndex]);

  const handleDestinationClick = React.useCallback((destName: string) => {
    if (setItinerary) {
      setItinerary((prev: any) => ({ ...prev, destination: destName }));
    }
    window.dispatchEvent(new CustomEvent('travel_aigent_set_destination', { detail: destName }));
  }, [setItinerary]);

  const handleSuggestionClick = React.useCallback((place: any) => {
    // This should send a message to the agent to select this accommodation
    window.dispatchEvent(new CustomEvent('travel_aigent_select_accommodation', { detail: place }));
  }, []);

  const handleActivitySuggestionClick = React.useCallback((place: any) => {
    window.dispatchEvent(new CustomEvent('travel_aigent_select_activity', { detail: place }));
  }, []);

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
        const bounds = new (window as any).google.maps.LatLngBounds();
        bounds.extend({ lat: prevGeo!.latitude, lng: prevGeo!.longitude });
        bounds.extend({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.panToBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 });
      } else if (nextGeo) {
        map.panTo({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.setZoom(15);
      }
    } else if (routePath.length > 0 || itinerary.suggested_accommodations?.length || itinerary.suggested_activities?.length) {
      // Zoom to fit all segments and suggestions if no active segment is selected
      const bounds = new (window as any).google.maps.LatLngBounds();
      let pointCount = 0;
      let lastPoint: { lat: number; lng: number } | null = null;

      routePath.forEach((pos) => {
        bounds.extend(pos);
        pointCount++;
        lastPoint = pos;
      });

      itinerary.suggested_accommodations?.forEach((place: any) => {
        const geo = place.geo || place.details?.geo || place.location;
        if (geo) {
          const pos = { lat: geo.latitude, lng: geo.longitude };
          bounds.extend(pos);
          pointCount++;
          lastPoint = pos;
        }
      });

      itinerary.suggested_activities?.forEach((place: any) => {
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
    } else if (segments.length === 0) {
      const dest = popularDestinations.find(d => d.name === itinerary.destination);
      if (dest) {
        map.panTo({ lat: dest.lat, lng: dest.lng });
        map.setZoom(11);
      } else {
        map.setZoom(4);
        map.panTo({ lat: 39.8283, lng: -98.5795 });
      }
    }
  }, [map, activeSegmentIndex, routePath, segments, itinerary.destination, popularDestinations, itinerary.suggested_accommodations, itinerary.suggested_activities]);

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
          {segments.length === 0 && !itinerary.destination && popularDestinations.map((dest, idx) => (
            <AdvancedMarker
              key={`popular-${idx}`}
              position={{ lat: dest.lat, lng: dest.lng }}
              title={dest.name}
              onClick={() => handleDestinationClick(dest.name)}
              className="cursor-pointer"
            >
              <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="bg-card border border-white/20 shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-primary group-hover:shadow-primary/20 transition-colors">
                  {dest.emoji}
                </div>
                <div className="bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-foreground/80 border border-white/10 whitespace-nowrap pointer-events-none">
                  {dest.name}
                </div>
              </div>
            </AdvancedMarker>
          ))}

          {itinerary.suggested_accommodations?.map((place: any, idx: number) => {
            const geo = place.geo || place.details?.geo || place.location;
            if (!geo) return null;
            
            const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Place';
            const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
            const rating = place.details?.rating || place.rating;
            const ratingCount = place.details?.user_rating_count || place.userRatingCount || place.user_rating_count;

            return (
                <AdvancedMarker
                    key={`suggestion-${idx}`}
                    position={{ lat: geo.latitude, lng: geo.longitude }}
                    title={placeName}
                    onClick={() => handleSuggestionClick(place)}
                    className="cursor-pointer"
                >
                    <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                        <div className="relative bg-violet-500 border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-violet-300 group-hover:shadow-violet-500/30 transition-all">
                            <Bed size={18} className="text-white" />
                            {(price || rating) && (
                                <div className="absolute -top-2 -right-4 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
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

          {itinerary.suggested_activities?.map((place: any, idx: number) => {
            const geo = place.geo || place.details?.geo || place.location;
            if (!geo) return null;
            
            const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Activity';
            const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
            const rating = place.details?.rating || place.rating;
            const ratingCount = place.details?.user_rating_count || place.userRatingCount || place.user_rating_count;

            return (
                <AdvancedMarker
                    key={`activity-suggestion-${idx}`}
                    position={{ lat: geo.latitude, lng: geo.longitude }}
                    title={placeName}
                    onClick={() => handleActivitySuggestionClick(place)}
                    className="cursor-pointer"
                >
                    <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                        <div className="relative bg-amber-500 border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-amber-300 group-hover:shadow-amber-500/30 transition-all">
                            <Utensils size={18} className="text-white" />
                            {(price || rating) && (
                                <div className="absolute -top-2 -right-4 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
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

          {segments.map((segment: Event, index: number) => {
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
                  isHovered={hoveredSegmentIndex === index}
                  onMouseEnter={() => setHoveredSegmentIndex?.(index)}
                  onMouseLeave={() => setHoveredSegmentIndex?.(null)}
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

      {segments.length === 0 && !itinerary.destination && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 bg-background/80 backdrop-blur-md border border-white/10 px-6 py-3 rounded-full shadow-lg text-sm font-medium text-foreground/80 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          Click a popular destination to get started
        </div>
      )}

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

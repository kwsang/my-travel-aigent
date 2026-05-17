'use client';

import React from 'react';
import { Map as MapIcon, AlertTriangle, Home } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';
import { APIProvider, Map, useMap, useApiIsLoaded, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import RoutePolyline from './RoutePolyline';
import { marineSunsetMapStyle } from '@/config/mapStyles';
import { Event } from '@/types';
import { API_CONFIG } from '@/config/constants';
import MapOverlay from './MapOverlay';
import SegmentInfoWindow from './SegmentInfoWindow';
import SuggestionInfoWindow from './SuggestionInfoWindow';
import PopularDestinationMarker from './PopularDestinationMarker';
import SuggestionMarker from './SuggestionMarker';
import TimelineMarker from './AdvancedSegmentMarker';

// Extracted outside the component to prevent infinite re-renders in useJsApiLoader
const MAPS_LIBRARIES: ("marker" | "places" | "geometry")[] = ["marker", "places", "geometry"];

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
    const geo = centerSegment?.geo || centerSegment?.details?.geo || itinerary.lodging?.geo || itinerary.lodging?.details?.geo || itinerary.lodging?.location;
    if (geo) {
      return { lat: geo.latitude, lng: geo.longitude };
    }
    
    if (!itinerary.lodging && destinationInfo?.suggested_lodging && destinationInfo.suggested_lodging.length > 0) {
      const firstSugg = destinationInfo.suggested_lodging[0];
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
  }, [segments, itinerary.destination, itinerary.lodging, popularDestinations, destinationInfo?.suggested_lodging, destinationInfo?.suggested_activities]);

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
      if ((s.segment === 'FLIGHT' || s.segment === 'TRANSPORT') && details?.polyline) {
        coords.push(details.polyline);
      }
    });
    if (itinerary.lodging) {
      coords.push(getCoords(itinerary.lodging));
    }
    destinationInfo?.suggested_lodging?.forEach((p: any) => coords.push(getCoords(p)));
    destinationInfo?.suggested_activities?.forEach((p: any) => coords.push(getCoords(p)));

    if (startGeo) {
      coords.push(`${startGeo.lat.toFixed(5)},${startGeo.lng.toFixed(5)}`);
    }

    if (destinationInfo?.location?.coordinates) {
      coords.push(`${destinationInfo.location.coordinates[1].toFixed(5)},${destinationInfo.location.coordinates[0].toFixed(5)}`);
    }

    // Sort to ensure order doesn't matter, then stringify for a stable dependency.
    return JSON.stringify(coords.filter(Boolean).sort());
  }, [segments, itinerary.lodging, destinationInfo, startGeo]);

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

    const getOptions = (segment: Event, edgeIndex: number, segmentIndex: number) => {
      const details = segment.details as typeof segment.details & { travel_mode?: string };
      const mode = details?.travel_mode || (segment.segment === 'FLIGHT' ? 'FLIGHT' : 'DRIVE');
      
      const hasActive = activeSegmentIndex !== null;
      const isActive = activeSegmentIndex === segmentIndex;

      let strokeOpacity = 0.8;
      let strokeWeight = 4;
      let icons = undefined;

      if (segment.segment === 'FLIGHT' || mode === 'FLIGHT') {
        strokeOpacity = 0;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeColor: routePalette[edgeIndex % routePalette.length], strokeOpacity: hasActive ? (isActive ? 1.0 : 0.15) : 0.9, scale: 3 }, offset: '0', repeat: '15px' }];
      } else if (mode === 'WALK' || mode === 'BICYCLE') {
        strokeOpacity = 0;
        strokeWeight = 3;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeColor: routePalette[edgeIndex % routePalette.length], strokeOpacity: hasActive ? (isActive ? 1.0 : 0.15) : 0.8, scale: 2 }, offset: '0', repeat: '10px' }];
      } else if (mode === 'TRANSIT') {
        strokeOpacity = 0;
        strokeWeight = 5;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeColor: routePalette[edgeIndex % routePalette.length], strokeOpacity: hasActive ? (isActive ? 1.0 : 0.15) : 0.8, scale: 4 }, offset: '0', repeat: '20px' }];
      } else {
        strokeOpacity = hasActive ? (isActive ? 1.0 : 0.15) : 0.8;
        strokeWeight = hasActive && isActive ? 6 : 4;
      }

      return {
        strokeColor: routePalette[edgeIndex % routePalette.length],
        strokeOpacity,
        strokeWeight,
        geodesic: true,
        icons,
        zIndex: isActive ? 100 : 1
      };
    };
    let lastValidGeo: { lat: number; lng: number } | null = null;
    let edgeCounter = 0;

      segments.forEach((curr, index) => {
        const currDetails = curr.details as typeof curr.details & { polyline?: string };
        const currGeo = curr.geo || curr.details?.geo;
        
        let path: { lat: number; lng: number }[] = [];

        if (curr.segment === 'TRANSPORT' || curr.segment === 'FLIGHT') {
        if (curr.segment === 'FLIGHT') {
          const originPos = lastValidGeo || startGeo;
          if (originPos) {
            let nextPos: { lat: number; lng: number } | null = null;
            
            if (currGeo) {
              nextPos = { lat: currGeo.latitude, lng: currGeo.longitude };
            } else {
              // Find the next available geographic point by scanning ahead
              for (let i = index + 1; i < segments.length; i++) {
                const nextSeg = segments[i];
                const nDetails = nextSeg.details as any;
                
                if (nDetails?.polyline && (window as any).google?.maps?.geometry?.encoding) {
                  try {
                    const decoded = (window as any).google.maps.geometry.encoding.decodePath(nDetails.polyline);
                    if (decoded.length > 0) {
                      nextPos = { lat: decoded[0].lat(), lng: decoded[0].lng() };
                      break;
                    }
                  } catch (e) {}
                }
                
                const nGeo = nextSeg.geo || nextSeg.details?.geo;
                if (nGeo) {
                  nextPos = { lat: nGeo.latitude, lng: nGeo.longitude };
                  break;
                }
              }
              
              // If no next point is found, fallback based on flight direction (Outbound vs Return)
              if (!nextPos && itinerary.lodging && index < segments.length / 2) {
                const accGeo = itinerary.lodging.geo || itinerary.lodging.details?.geo || itinerary.lodging.location;
                if (accGeo) {
                  nextPos = { lat: accGeo.latitude, lng: accGeo.longitude };
                } else if (destinationInfo?.location?.coordinates) {
                  nextPos = { lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] };
                }
              } else if (!nextPos && startGeo) {
                nextPos = startGeo;
              }
            }
            
            if (nextPos) {
              path = [originPos, nextPos];
            }
          }
        } else if (currDetails?.polyline && (window as any).google?.maps?.geometry?.encoding) {
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
        }

      if (path.length > 0) {

        edges.push({
          path: path,
          options: getOptions(curr, edgeCounter++, index)
        });
      }
      if (currGeo) {
        lastValidGeo = { lat: currGeo.latitude, lng: currGeo.longitude };
      } else if (path.length > 0) {
        lastValidGeo = path[path.length - 1];
      }
        });
    return edges;
      }, [segments, activeSegmentIndex]);

  const prevGeoSignatureRef = React.useRef<string | null>(null);

  // Automatically fit bounds or pan to active segment
  React.useEffect(() => {
    if (!map || !isLoaded) return;

    const isGeoSignatureChanged = prevGeoSignatureRef.current !== geoSignature;
    prevGeoSignatureRef.current = geoSignature;

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
    } else if (isGeoSignatureChanged) {
      if (segments.length > 0 || itinerary.lodging || (!itinerary.lodging && destinationInfo?.suggested_lodging?.length) || destinationInfo?.suggested_activities?.length || (itinerary.destination && destinationInfo?.location?.coordinates)) {
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
  
        if (itinerary.lodging) {
          const geo = itinerary.lodging.geo || itinerary.lodging.details?.geo || itinerary.lodging.location;
          if (geo) {
            const pos = { lat: geo.latitude, lng: geo.longitude };
            bounds.extend(pos);
            pointCount++;
            lastPoint = pos;
          }
        }
  
        if (!itinerary.lodging) {
          destinationInfo?.suggested_lodging?.forEach((place: any) => {
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
      } else if (segments.length === 0 && !itinerary.lodging) {
        const dest = popularDestinations.find(d => d.name === itinerary.destination);
        if (dest) {
          map.panTo({ lat: dest.lat, lng: dest.lng });
          map.setZoom(11);
        } else {
          map.setZoom(4);
          map.panTo({ lat: 39.8283, lng: -98.5795 });
        }
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
          onClick={async (e: any) => {
            if (e.detail?.placeId && map) {
              // Prevent the default Google Maps POI InfoWindow from opening
              if (typeof e.stop === 'function') {
                e.stop(); 
              } else {
                e.mapEvent?.stop?.(); // Fallback for older vis.gl versions
              }
              
              const Place = (window as any).google.maps.places.Place;
              const place = new Place({ id: e.detail.placeId });
              
              try {
                await place.fetchFields({
                  fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel', 'types']
                });
                
                setActiveSuggestion({
                  _suggestionType: 'activity',
                  details: {
                    name: place.displayName,
                    description: place.formattedAddress,
                    geo: {
                      latitude: place.location?.lat(),
                      longitude: place.location?.lng()
                    },
                    rating: place.rating,
                    user_rating_count: place.userRatingCount,
                  },
                  priceLevel: place.priceLevel,
                  types: place.types || []
                });
                setActiveSegmentIndex(null as any);
              } catch (err) {
                console.error("Error fetching place details:", err);
              }
            }
          }}
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
            <PopularDestinationMarker
              key={`popular-${dest.name}-${idx}`}
              dest={dest}
              idx={idx}
              isHovered={hoveredPopularIndex === idx}
              onHover={setHoveredPopularIndex}
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
            />
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

          {/* Suggested Lodgings */}
          {!!itinerary.destination && !itinerary.lodging && destinationInfo?.suggested_lodging?.map((place: any, idx: number) => (
            <SuggestionMarker
              key={`suggestion-acc-${idx}`}
              place={place}
              idx={idx}
              type="lodging"
              onClick={() => {
                setActiveSuggestion({ ...place, _suggestionType: 'lodging' });
                setActiveSegmentIndex(null as any);
              }}
              formatPrice={formatPrice}
            />
          ))}

          {/* Suggested Activities */}
          {!!itinerary.destination && destinationInfo?.suggested_activities?.map((place: any, idx: number) => (
            <SuggestionMarker
              key={`suggestion-act-${idx}`}
              place={place}
              idx={idx}
              type="activity"
              onClick={() => {
                setActiveSuggestion({ ...place, _suggestionType: 'activity' });
                setActiveSegmentIndex(null as any);
              }}
              formatPrice={formatPrice}
            />
          ))}

          {/* Timeline Segments */}
          {segments.map((segment: Event, index: number) => {
            if (['TRANSPORT', 'FLIGHT', 'LOGISTICS'].includes(segment.segment)) return null;
            
            return (
              <TimelineMarker
                key={`${segment.day}-${index}`} 
                segment={segment}
                index={index}
                isActive={activeSegmentIndex === index}
                isHovered={hoveredSegmentIndex === index}
                onClick={() => {
                  setActiveSegmentIndex(activeSegmentIndex === index ? null : index);
                  setActiveSuggestion(null);
                }}
                onMouseEnter={() => setHoveredSegmentIndex?.(index)}
                onMouseLeave={() => setHoveredSegmentIndex?.(null)}
                formatPrice={formatPrice}
              />
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
            <SegmentInfoWindow 
              segment={segments[activeSegmentIndex]} 
              onClose={() => setActiveSegmentIndex(null as any)}
              formatPrice={formatPrice}
            />
          )}

          {/* Active Suggestion Info Window */}
          {activeSuggestion && (
            <SuggestionInfoWindow
              place={activeSuggestion}
              onClose={() => setActiveSuggestion(null)}
              onAddLodging={(place) => setItinerary?.((prev: any) => ({ ...prev, lodging: place }))}
              onAddActivity={(placeName, eventCategory) => window.dispatchEvent(new CustomEvent('travel_aigent_add_activity', { detail: { placeName, eventCategory } }))}
              formatPrice={formatPrice}
            />
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
      <MapOverlay primaryDestination={primaryDestination} startingLocation={startingLocation} />

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

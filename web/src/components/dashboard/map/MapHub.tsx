'use client';

import React from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { Map, useMap, useApiIsLoaded } from '@vis.gl/react-google-maps';
import { marineSunsetMapStyle } from '@/config/mapStyles';
import { SuggestionPlace, Event, Destination } from '@/types';
import { API_CONFIG } from '@/config/constants';
import MapOverlay from './MapOverlay';
import SegmentInfoWindow from './SegmentInfoWindow';
import SuggestionInfoWindow from './SuggestionInfoWindow';
import MapSearchBar from './MapSearchBar';
import { useMapBounds } from '@/hooks/useMapBounds';
import { useMapClick } from '@/hooks/useMapClick';
import MapMarkers from './MapMarkers';
import MapUnavailableState from './MapUnavailableState';
import MapLoadingState from './MapLoadingState';
import MapActionToast from './MapActionToast';
import { MapProvider } from './MapContext';

/**
 * MapHub Component
 * Visualizes itinerary segments on a geographic workspace.
 */
export default function MapHub() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

  if (!apiKey) {
    return <MapUnavailableState />;
  }

  return (
    <div className="relative h-full w-full bg-background overflow-hidden">
      <MapInner />
    </div>
  );
}

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

function MapInner() {
  const { segments, profile, isRelaxed, activeSegmentIndex, setActiveSegmentIndex, itinerary, setItinerary, hoveredSegmentIndex, setHoveredSegmentIndex, sessionId, userId } = useItineraryData();
  const map = useMap();
  const isLoaded = useApiIsLoaded();

  const [popularDestinations, setPopularDestinations] = React.useState<{name: string; lat: number; lng: number; emoji: string}[]>([]);

  const [destinationInfo, setDestinationInfo] = React.useState<Destination | null>(null);

  const [hoveredPopularIndex, setHoveredPopularIndex] = React.useState<number | null>(null);
  const hoveredPopularIndexRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    hoveredPopularIndexRef.current = hoveredPopularIndex;
  }, [hoveredPopularIndex]);

  const currentItineraryRef = React.useRef(itinerary);
  React.useEffect(() => {
    currentItineraryRef.current = itinerary;
  }, [itinerary]);

  const [actionToast, setActionToast] = React.useState<{title: string, desc: string} | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const showToast = React.useCallback((title: string, desc: string) => {
    setActionToast(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    
    setTimeout(() => {
      setActionToast({ title, desc });
      toastTimeoutRef.current = setTimeout(() => setActionToast(null), 4000);
    }, 10);
  }, []);

  React.useEffect(() => {
    const handleAgentToast = (e: CustomEvent<{title: string; desc: string}>) => {
      if (e.detail?.title) {
        showToast(e.detail.title, e.detail.desc || '');
      }
    };
    window.addEventListener('travel_aigent_show_toast', handleAgentToast as EventListener);
    return () => window.removeEventListener('travel_aigent_show_toast', handleAgentToast as EventListener);
  }, [showToast]);

  React.useEffect(() => {
    return () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };
  }, []);

  const [activeSuggestion, setActiveSuggestion] = React.useState<SuggestionPlace | null>(null);

  React.useEffect(() => {
    if (!itinerary.destination) {
      setDestinationInfo(null);
      return;
    }

    // Initial fetch to get the current state
    fetch(`${API_CONFIG.BASE_URL}/destinations/${encodeURIComponent(itinerary.destination)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setDestinationInfo(data))
      .catch(err => console.error("Failed to load destination info", err));

    let eventSource: EventSource | null = null;

    // Connect to SSE stream if we still need lodging suggestions
    if (itinerary.destination && !itinerary.lodging) {
      eventSource = new EventSource(`${API_CONFIG.BASE_URL}/destinations/${encodeURIComponent(itinerary.destination)}/stream`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setDestinationInfo(data);
        } catch (err) {
          console.error("Failed to parse SSE data", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE connection error", err);
      };
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [itinerary.destination, itinerary.lodging]);

  const fetchPopular = React.useCallback(() => {
    fetch(`${API_CONFIG.BASE_URL}/destinations/popular`)
      .then(res => res.json())
      .then(data => setPopularDestinations(data))
      .catch(err => console.error("Failed to load popular destinations", err));
  }, []);

  const handleSelectDestination = React.useCallback(async (destName: string) => {
    console.log(`[MapHub] Setting destination: ${destName}`);
    const currentItinerary = currentItineraryRef.current;
    const isDefaultName = !currentItinerary.trip_name || currentItinerary.trip_name === 'New Trip';
    const newItinerary = { 
      ...currentItinerary, 
      destination: destName,
      ...(isDefaultName ? { trip_name: `${destName} Trip` } : {})
    };
    setItinerary?.(newItinerary);
    
    if (sessionId && userId) {
      try {
        await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}?user_id=${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItinerary),
        });
      } catch (err) {
        console.error("Failed to instantly save destination", err);
      }
    }
    
    showToast(`Destination set to ${destName}`, 'Finding transport and lodging...');
    window.dispatchEvent(new CustomEvent('travel_aigent_set_destination', { detail: destName }));
  }, [sessionId, userId, setItinerary, showToast]);

  const handleSelectLodging = React.useCallback(async (placeData: SuggestionPlace) => {
    const currentItinerary = currentItineraryRef.current;
    const isReplacement = !!currentItinerary.lodging;
    const newItinerary = { ...currentItinerary, lodging: placeData };
    setItinerary?.(newItinerary);

    if (sessionId && userId) {
      try {
        await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}?user_id=${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItinerary),
        });
      } catch (e) {
        console.error("Failed to instantly save lodging", e);
      }
    }

    showToast(
      isReplacement ? `Lodging replaced with ${placeData.name}` : `Lodging set to ${placeData.name}`, 
      isReplacement ? 'Updating itinerary...' : 'Finding transport and activities...'
    );
    window.dispatchEvent(new CustomEvent('travel_aigent_set_lodging', { detail: placeData }));
  }, [sessionId, userId, setItinerary, showToast]);

  const handleAddActivity = React.useCallback((placeName: string, eventCategory: string) => {
    console.log(`[MapHub] Asking agent to schedule activity: ${placeName}`);
    showToast(`Adding ${placeName}`, 'Asking the agent to schedule it...');
    window.dispatchEvent(new CustomEvent('travel_aigent_add_activity', { detail: { placeName, eventCategory } }));
  }, [showToast]);

  const handleMapAddLodging = React.useCallback((place: SuggestionPlace) => {
    handleSelectLodging({
      name: place.details?.name || place.displayName?.text || place.name || 'Selected Lodging',
      description: place.details?.description || place.formattedAddress || place.formatted_address || undefined,
      geo: place.geo || place.details?.geo || (place.geometry?.location ? { latitude: place.geometry.location.lat(), longitude: place.geometry.location.lng() } : place.location) || undefined,
      rating: place.details?.rating || place.rating || undefined,
      user_rating_count: place.details?.user_rating_count || place.userRatingCount || place.user_rating_count || place.user_ratings_total || undefined,
      priceLevel: place.priceLevel || place.details?.priceLevel || place.price_level || undefined,
      types: place.types || place.details?.types || [],
      google_maps_uri: place.google_maps_uri || place.details?.google_maps_uri || undefined
    });
  }, [handleSelectLodging]);

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
  const startingLocation = profile?.preferences?.starting_location || undefined;

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
    const centerSegment = segments.find((s: Event) => {
      if (!itinerary.lodging && ['DINING', 'EXPERIENCE'].includes(s.segment)) return false;
      return s.geo || s.details?.geo;
    });
    const lodgingPlace = itinerary.lodging as SuggestionPlace | undefined;
    const geo = centerSegment?.geo || centerSegment?.details?.geo || lodgingPlace?.geo || lodgingPlace?.details?.geo || lodgingPlace?.location;
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

    if (itinerary.lodging && destinationInfo?.suggested_activities && destinationInfo.suggested_activities.length > 0) {
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
      if (!itinerary.lodging && ['DINING', 'EXPERIENCE'].includes(s.segment)) return;
      coords.push(getCoords(s));
    });
    if (itinerary.lodging) {
      coords.push(getCoords(itinerary.lodging));
    }
    if (!itinerary.lodging) {
      destinationInfo?.suggested_lodging?.forEach((p: any) => coords.push(getCoords(p)));
    }
    if (itinerary.lodging) {
      destinationInfo?.suggested_activities?.forEach((p: any) => coords.push(getCoords(p)));
    }

    if (startGeo) {
      coords.push(`${startGeo.lat.toFixed(5)},${startGeo.lng.toFixed(5)}`);
    }

    if (destinationInfo?.location?.coordinates) {
      coords.push(`${destinationInfo.location.coordinates[1].toFixed(5)},${destinationInfo.location.coordinates[0].toFixed(5)}`);
    }

    // Sort to ensure order doesn't matter, then stringify for a stable dependency.
    return JSON.stringify(coords.filter(Boolean).sort());
  }, [segments, itinerary.lodging, destinationInfo, startGeo]);

  // Automatically fit bounds or pan to active segment
  useMapBounds(
    map,
    isLoaded,
    activeSegmentIndex,
    geoSignature,
    segments,
    itinerary,
    destinationInfo,
    popularDestinations,
    startGeo
  );

  const handleMapClick = useMapClick(
    map,
    currentItineraryRef,
    showToast,
    setActiveSuggestion,
    setActiveSegmentIndex
  );

  const mapContextValue = React.useMemo(() => ({
    handleSelectDestination,
    handleSelectLodging,
    handleAddActivity,
    handleMapAddLodging,
    setActiveSuggestion,
    formatPrice
  }), [handleSelectDestination, handleSelectLodging, handleAddActivity, handleMapAddLodging, setActiveSuggestion]);

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
          onClick={handleMapClick}
        >
          <MapProvider value={mapContextValue}>
            <MapMarkers
              startGeo={startGeo}
              startingLocation={startingLocation}
              destinationInfo={destinationInfo}
              popularDestinations={popularDestinations}
              hoveredPopularIndex={hoveredPopularIndex}
              setHoveredPopularIndex={setHoveredPopularIndex}
            />

            {/* Active Segment Info Window */}
            {activeSegmentIndex !== null && segments[activeSegmentIndex] && (
              <SegmentInfoWindow 
                segment={segments[activeSegmentIndex]} 
                onClose={() => setActiveSegmentIndex(null)}
              />
            )}

            {/* Active Suggestion Info Window */}
            {activeSuggestion && (
              <SuggestionInfoWindow
                place={activeSuggestion}
                hasLodging={!!itinerary.lodging}
                onClose={() => setActiveSuggestion(null)}
              />
            )}
          </MapProvider>
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

      {/* Search Bar for selecting a destination */}
      {!itinerary.destination && isLoaded && (
        <MapSearchBar
          instruction="1. Select a Destination"
          placeholder="Where do you want to go?"
          onPlaceSelected={(place) => handleSelectDestination(place.formatted_address || place.name)}
          includedPrimaryTypes={['locality', 'administrative_area_level_3']}
        />
      )}

      {/* Search Bar for selecting a lodging */}
      {!!itinerary.destination && !itinerary.lodging && isLoaded && (
        <MapSearchBar
          instruction="2. Choose Your Lodging"
          placeholder="Search for a hotel or lodging..."
          onPlaceSelected={handleMapAddLodging}
          includedPrimaryTypes={['lodging']}
          biasToMapBounds={true}
        />
      )}

      {/* Search Bar for adding an activity */}
      {!!itinerary.destination && !!itinerary.lodging && isLoaded && (
        <MapSearchBar
          instruction="3. Add Activities & Dining"
          placeholder="Search for an activity or dining venue..."
          onPlaceSelected={(place) => {
            setActiveSuggestion({
              _suggestionType: 'activity',
              details: {
                name: place.details?.name || place.displayName?.text || place.name || 'Selected Venue',
                description: place.details?.description || place.formattedAddress || place.formatted_address || undefined,
                geo: place.geo || place.details?.geo || (place.geometry?.location ? { latitude: place.geometry.location.lat(), longitude: place.geometry.location.lng() } : place.location) || undefined,
                rating: place.details?.rating || place.rating || undefined,
                user_rating_count: place.details?.user_rating_count || place.userRatingCount || place.user_rating_count || place.user_ratings_total || undefined,
              },
              priceLevel: place.priceLevel || place.details?.priceLevel || place.price_level || undefined,
              types: place.types || place.details?.types || [],
              google_maps_uri: place.google_maps_uri || place.details?.google_maps_uri || undefined
            });
            setActiveSegmentIndex(null);
          }}
          includedPrimaryTypes={['establishment']}
          biasToMapBounds={true}
        />
      )}

      {/* Loading State / Fallback UI */}
      {!isLoaded && <MapLoadingState />}

      {/* Subtle Action Toast */}
      <MapActionToast actionToast={actionToast || (!!itinerary.destination && !itinerary.lodging && (!destinationInfo?.suggested_lodging || destinationInfo.suggested_lodging.length === 0) 
        ? { title: 'Agent is working...', desc: 'Finding lodging to suggest' } 
        : null)} />
    </>
  );
}

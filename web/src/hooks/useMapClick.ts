import { useCallback } from 'react';

export function useMapClick(
  map: any,
  currentItineraryRef: React.MutableRefObject<any>,
  showToast: (title: string, desc: string) => void,
  setActiveSuggestion: (suggestion: any) => void,
  setActiveSegmentIndex: (idx: number | null) => void
) {
  return useCallback(async (e: any) => {
    // 1. Destination Selection Mode (Reverse Geocode ANY map click)
    if (!currentItineraryRef.current.destination && map && e.detail?.latLng) {
      if (typeof e.stop === 'function') {
        e.stop(); 
      } else {
        e.mapEvent?.stop?.();
      }
      
      const geocoder = new (window as any).google.maps.Geocoder();
      geocoder.geocode({ location: e.detail.latLng }, (results: any, status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          const region = results.find((r: any) => r.types.some((t: string) => 
            ['locality', 'sublocality', 'administrative_area_level_3', 'administrative_area_level_2', 'administrative_area_level_1'].includes(t)
          ));
          
          const destName = region ? region.formatted_address : (results.find((r: any) => r.types.includes('country')) || results[0]).formatted_address;
          
          setActiveSuggestion({
            _suggestionType: 'destination',
            details: {
              name: destName,
              description: 'Suggested Destination',
              geo: {
                latitude: e.detail.latLng.lat,
                longitude: e.detail.latLng.lng
              }
            }
          });
          setActiveSegmentIndex(null);
        } else {
          showToast('Invalid Destination', 'Please click a valid land area on the map.');
        }
      });
      return;
    }

    // 2. Activity Suggestion Mode (Requires a specific POI placeId)
    if (e.detail?.placeId && map && currentItineraryRef.current.destination) {
      // Prevent the default Google Maps POI InfoWindow from opening
      if (typeof e.stop === 'function') {
        e.stop(); 
      } else {
        e.mapEvent?.stop?.();
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
        setActiveSegmentIndex(null);
      } catch (err) {
        console.error("Error fetching place details:", err);
      }
    }
  }, [map, currentItineraryRef, showToast, setActiveSuggestion, setActiveSegmentIndex]);
}
import { useCallback } from 'react';

export function useMapClick(
  map: any,
  currentItineraryRef: React.MutableRefObject<any>,
  showToast: (title: string, desc: string) => void,
  handleSelectDestination: (destName: string) => void,
  setActiveSuggestion: (suggestion: any) => void,
  setActiveSegmentIndex: (idx: number | null) => void
) {
  return useCallback(async (e: any) => {
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
        
        if (!currentItineraryRef.current.destination) {
          // Restrict map clicks to geographic regions when setting a destination
          const isRegion = place.types?.some((t: string) => 
            ['locality', 'sublocality', 'administrative_area_level_3', 'administrative_area_level_2', 'administrative_area_level_1', 'country', 'political'].includes(t)
          );
          if (!isRegion) {
            showToast('Invalid Destination', 'Please click a city, town, or region label on the map.');
            return;
          }

          handleSelectDestination(place.displayName);
          return;
        }

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
  }, [map, currentItineraryRef, showToast, handleSelectDestination, setActiveSuggestion, setActiveSegmentIndex]);
}
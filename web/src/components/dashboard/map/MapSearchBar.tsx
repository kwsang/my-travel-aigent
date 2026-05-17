import React from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

interface MapSearchBarProps {
  type: 'regions' | 'establishment';
  placeholder: string;
  onPlaceSelected: (place: any) => void;
}

export default function MapSearchBar({ type, placeholder, onPlaceSelected }: MapSearchBarProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isLoaded = useApiIsLoaded();

  React.useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

    containerRef.current.innerHTML = '';
    const autocomplete = new (window as any).google.maps.places.PlaceAutocompleteElement();
    
    containerRef.current.appendChild(autocomplete);

    const listener = (e: any) => {
      const place = e.place;
      if (!place) return;
      
      place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel', 'types']
      }).then(() => {
        onPlaceSelected({
          name: place.displayName,
          formatted_address: place.formattedAddress,
          geometry: {
            location: {
              lat: () => place.location?.lat(),
              lng: () => place.location?.lng()
            }
          },
          rating: place.rating,
          user_ratings_total: place.userRatingCount,
          price_level: place.priceLevel,
          types: place.types || []
        });
      });
    };

    autocomplete.addEventListener('gmp-placeselect', listener);

    return () => {
      autocomplete.removeEventListener('gmp-placeselect', listener);
    };
  }, [isLoaded, type, onPlaceSelected]);

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 pointer-events-auto animate-in fade-in slide-in-from-top-4">
      <div 
        ref={containerRef} 
        className="relative w-full shadow-2xl rounded-full overflow-hidden ring-1 ring-black/5 [&>gmp-place-autocomplete]:w-full"
      />
    </div>
  );
}
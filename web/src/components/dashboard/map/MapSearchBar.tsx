import React from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

interface MapSearchBarProps {
  type: 'regions' | 'establishment';
  placeholder: string;
  instruction?: string;
  onPlaceSelected: (place: any) => void;
}

export default function MapSearchBar({ type, placeholder, instruction, onPlaceSelected }: MapSearchBarProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isLoaded = useApiIsLoaded();

  React.useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

    containerRef.current.innerHTML = '';
    const autocomplete = new (window as any).google.maps.places.PlaceAutocompleteElement();
    
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.placeholder = placeholder;
    autocomplete.appendChild(inputElement);

    containerRef.current.appendChild(autocomplete);

    const listener = (e: any) => {
      const place = e.place;
      if (!place) return;
      
      place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel', 'types', 'googleMapsURI']
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
          types: place.types || [],
          google_maps_uri: place.googleMapsURI
        });
      });
    };

    autocomplete.addEventListener('gmp-placeselect', listener);

    return () => {
      autocomplete.removeEventListener('gmp-placeselect', listener);
    };
  }, [isLoaded, type, placeholder, onPlaceSelected]);

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 flex flex-col items-center gap-2 pointer-events-auto animate-in fade-in slide-in-from-top-4">
      {instruction && (
        <div className="bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg border border-primary/20 backdrop-blur-md">
          {instruction}
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        gmp-place-autocomplete {
          width: 100%;
        }
        gmp-place-autocomplete input {
          width: 100%;
          background-color: hsl(var(--card));
          color: hsl(var(--card-foreground));
          border: 1px solid hsla(var(--border) / 0.5);
          border-radius: 9999px;
          padding: 0.875rem 1.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        gmp-place-autocomplete input:focus {
          outline: none;
          box-shadow: 0 0 0 2px hsla(var(--primary) / 0.5);
        }
        gmp-place-autocomplete input::placeholder {
          color: hsl(var(--muted-foreground));
          opacity: 0.7;
        }
      ` }} />
      <div 
        ref={containerRef} 
        className="relative w-full rounded-full"
      />
    </div>
  );
}
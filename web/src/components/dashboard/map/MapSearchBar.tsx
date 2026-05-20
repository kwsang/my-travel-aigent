import React, { useEffect, useRef } from 'react';
import { useApiIsLoaded, useMap } from '@vis.gl/react-google-maps';
import { SuggestionPlace } from '@/types';

interface MapSearchBarProps {
  placeholder: string;
  instruction?: string;
  onPlaceSelected: (place: SuggestionPlace) => void;
  includedPrimaryTypes?: string[];
  countryRestriction?: string | string[];
  biasToMapBounds?: boolean;
}

export default function MapSearchBar({ placeholder, instruction, onPlaceSelected, includedPrimaryTypes, countryRestriction, biasToMapBounds }: MapSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const isLoaded = useApiIsLoaded();
  const map = useMap();

  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onPlaceSelected]);

  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    if (!autocompleteRef.current) {
      const options: any = {
        fields: ['name', 'formatted_address', 'geometry', 'rating', 'user_ratings_total', 'price_level', 'types', 'url']
      };

      if (includedPrimaryTypes) {
        options.types = includedPrimaryTypes;
      }

      if (countryRestriction) {
        options.componentRestrictions = { country: countryRestriction };
      }

      autocompleteRef.current = new (window as any).google.maps.places.Autocomplete(inputRef.current, options);

      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (!place) return;
        
        onPlaceSelectedRef.current({
          name: place.name,
          formatted_address: place.formatted_address,
          geometry: place.geometry ? {
            location: {
              lat: () => place.geometry.location.lat(),
              lng: () => place.geometry.location.lng()
            }
          } : undefined,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          price_level: place.price_level,
          types: place.types || [],
          google_maps_uri: place.url
        });
      });
    }

    if (biasToMapBounds && map) {
      autocompleteRef.current.bindTo('bounds', map);
    } else if (autocompleteRef.current) {
      autocompleteRef.current.unbind('bounds');
    }
  }, [isLoaded, includedPrimaryTypes, countryRestriction, biasToMapBounds, map]);

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 flex flex-col items-center gap-2 pointer-events-auto animate-in fade-in slide-in-from-top-4">
      {instruction && (
        <div className="bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg border border-primary/20 backdrop-blur-md">
          {instruction}
        </div>
      )}
      <input 
        ref={inputRef} 
        type="text"
        placeholder={placeholder}
        className="w-full bg-card text-card-foreground border border-border/50 rounded-full px-6 py-3.5 text-sm font-medium transition-all shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground placeholder:opacity-70"
      />
    </div>
  );
}
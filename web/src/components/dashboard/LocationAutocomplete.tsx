'use client';

import React, { useEffect, useRef } from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

interface LocationAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  includedPrimaryTypes?: string[];
  countryRestriction?: string | string[];
}

export default function LocationAutocomplete({ 
  value, 
  onChange, 
  placeholder = "e.g. New York, USA", 
  className = "",
  includedPrimaryTypes,
  countryRestriction
}: LocationAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const isLoaded = useApiIsLoaded();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    const options: any = {
      fields: ['formatted_address', 'name']
    };

    if (includedPrimaryTypes) {
      options.types = includedPrimaryTypes;
    }

    if (countryRestriction) {
      options.componentRestrictions = { country: countryRestriction };
    }

    // Initialize Classic Google Maps Autocomplete on our native React input
    autocompleteRef.current = new (window as any).google.maps.places.Autocomplete(inputRef.current, options);

    const listener = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (!place) return;
      
      if (place.formatted_address) {
        onChangeRef.current(place.formatted_address);
      } else if (place.name) {
        onChangeRef.current(place.name);
      }
    });

    return () => { 
      if (listener) {
        (window as any).google.maps.event.removeListener(listener);
      }
    };
  }, [isLoaded, includedPrimaryTypes, countryRestriction]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${className}`}
    />
  );
}
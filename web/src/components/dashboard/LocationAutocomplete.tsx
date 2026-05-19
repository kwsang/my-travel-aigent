'use client';

import React, { useEffect, useRef } from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

interface LocationAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export default function LocationAutocomplete({ 
  value, 
  onChange, 
  placeholder = "e.g. New York, USA", 
  className = ""
}: LocationAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const isLoaded = useApiIsLoaded();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        const autocomplete = new (window as any).google.maps.places.PlaceAutocompleteElement();

        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.placeholder = placeholder;
        inputElement.value = value || '';
        inputElement.className = `w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${className}`;
        
        
        inputElement.addEventListener('input', (e: any) => {
          onChangeRef.current(e.target.value);
        });

        autocomplete.appendChild(inputElement);
        containerRef.current.appendChild(autocomplete);

        const listener = (e: any) => {
          const place = e.place;
          if (!place) return;
          
          place.fetchFields({ fields: ['displayName', 'formattedAddress'] }).then(() => {
            if (place.formattedAddress) {
              onChangeRef.current(place.formattedAddress);
              inputElement.value = place.formattedAddress;
            } else if (place.displayName) {
              onChangeRef.current(place.displayName);
              inputElement.value = place.displayName;
            }
          });
        };

        autocomplete.addEventListener('gmp-placeselect', listener);

    return () => { 
      autocomplete.removeEventListener('gmp-placeselect', listener); 
    };
  }, [isLoaded, placeholder, className]);

  // Keeps the DOM input visually in sync when the parent fetches async profile data
  useEffect(() => {
    if (containerRef.current) {
      const input = containerRef.current.querySelector('input');
      if (input && input.value !== value && document.activeElement !== input) {
        input.value = value || '';
      }
    }
  }, [value]);

  return (
    <>
      <div ref={containerRef} className={`w-full min-h-[46px] ${className}`} />
    </>
  );
}
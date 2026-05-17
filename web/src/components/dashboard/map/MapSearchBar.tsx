import React from 'react';
import { Search } from 'lucide-react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

interface MapSearchBarProps {
  type: 'regions' | 'establishment';
  placeholder: string;
  onPlaceSelected: (place: any) => void;
}

export default function MapSearchBar({ type, placeholder, onPlaceSelected }: MapSearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isLoaded = useApiIsLoaded();

  React.useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      types: type === 'regions' ? ['(regions)'] : ['establishment'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place && (place.formatted_address || place.name)) {
        onPlaceSelected(place);
      }
    });

    return () => {
      (window as any).google.maps.event.removeListener(listener);
    };
  }, [isLoaded, type, onPlaceSelected]);

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 pointer-events-auto animate-in fade-in slide-in-from-top-4">
      <div className="relative flex items-center bg-card text-card-foreground shadow-2xl rounded-full border border-border/50 overflow-hidden ring-1 ring-black/5">
        <div className="pl-4 pr-2 text-muted-foreground">
          <Search size={18} />
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          className="w-full bg-transparent border-none focus:outline-none py-3 pr-4 text-sm font-medium placeholder:text-muted-foreground/70"
        />
      </div>
    </div>
  );
}
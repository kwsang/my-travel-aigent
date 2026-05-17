import React from 'react';
import { MapPin, Navigation } from 'lucide-react';

interface MapOverlayProps {
  primaryDestination: any;
  startingLocation?: any;
}

export default function MapOverlay({ primaryDestination, startingLocation }: MapOverlayProps) {
  return (
    <div className="absolute top-6 left-6 z-20 flex flex-col items-start gap-2 pointer-events-none animate-in fade-in slide-in-from-left-4 duration-500">
      <div className="flex items-center gap-3 bg-card/90 backdrop-blur-xl border border-white/10 px-4 py-3 rounded-2xl shadow-xl ring-1 ring-black/5">
        <div className="bg-primary/20 p-2 rounded-full">
          <MapPin className="w-4 h-4 text-primary drop-shadow-sm" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">Destination</span>
          <span className="text-base font-black text-foreground tracking-tight leading-none hover:bg-accent hover:text-accent-foreground px-1.5 py-0.5 -ml-1.5 rounded-md transition-colors duration-200 cursor-default pointer-events-auto">{primaryDestination as React.ReactNode}</span>
        </div>
      </div>
      
      {startingLocation && (
        <div className="flex items-center gap-2 bg-card/60 backdrop-blur-md border border-white/5 px-3 py-1.5 rounded-xl ml-2 shadow-sm">
          <Navigation className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Starting from <span className="text-foreground font-bold">{startingLocation as React.ReactNode}</span>
          </span>
        </div>
      )}
    </div>
  );
}
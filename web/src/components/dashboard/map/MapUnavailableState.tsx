import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function MapUnavailableState() {
  return (
    <div className="relative h-full w-full bg-background overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-destructive p-6 rounded-2xl bg-card border border-destructive/10 shadow-xl">
          <AlertTriangle className="w-8 h-8 text-destructive/80" />
          <div className="text-center">
            <h3 className="font-bold uppercase tracking-widest text-xs mb-1">Map Unavailable</h3>
            <p className="text-xs font-medium opacity-80">Google Maps API key is missing.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
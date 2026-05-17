import React from 'react';
import { Map as MapIcon } from 'lucide-react';

export default function MapLoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="rounded-full bg-card p-4 shadow-xl border border-border">
          <MapIcon className="w-8 h-8 text-primary/40 animate-pulse" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-foreground/60 uppercase tracking-widest text-xs">Loading Workspace...</h3>
        </div>
      </div>
    </div>
  );
}
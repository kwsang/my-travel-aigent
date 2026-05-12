'use client';

import React from 'react';
import { Map as MapIcon } from 'lucide-react';
import { useItineraryData } from '@/context/ItineraryContext';

/**
 * MapHub Component
 * Visualizes itinerary segments on a geographic workspace.
 */
export default function MapHub() {
  const { segments, isRelaxed } = useItineraryData();

  return (
    <div className="relative h-full w-full bg-background overflow-hidden">
      {/* Mock Map Background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="rounded-full bg-card p-4 shadow-xl border border-border">
            <MapIcon className="w-8 h-8 text-primary/40" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-foreground/60 uppercase tracking-widest text-xs">Geographic Workspace</h3>
            <p className="text-[11px] font-medium italic">Ready to plot {segments.length} segments with {isRelaxed ? 'relaxed' : 'strict'} buffering.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

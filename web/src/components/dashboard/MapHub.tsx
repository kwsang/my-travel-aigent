'use client';

import React from 'react';
import { Event } from '@/types/models';
import { Map as MapIcon } from 'lucide-react';

interface MapHubProps {
  segments: Event[];
  isRelaxed: boolean;
}

/**
 * MapHub Component
 * Visualizes itinerary segments on a geographic workspace.
 */
export default function MapHub({ segments, isRelaxed }: MapHubProps) {
  return (
    <div className="relative h-full w-full bg-slate-100 overflow-hidden">
      {/* Mock Map Background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="rounded-full bg-white p-4 shadow-sm border border-slate-200">
            <MapIcon className="w-8 h-8 text-slate-300" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-slate-600 uppercase tracking-widest text-xs">Geographic Workspace</h3>
            <p className="text-[11px] font-medium italic">Ready to plot {segments.length} segments with {isRelaxed ? 'relaxed' : 'strict'} buffering.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

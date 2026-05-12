'use client';

import React from 'react';
import { Event } from '@/types/models';

interface TimelineViewProps {
  segments: Event[];
  riskTolerance?: 'relaxed' | 'strict';
  viewMode: 'total' | 'per_person';
  partySize?: number;
}

// Map segment types to Lucide icons
import { Car, Utensils, Sparkles, Hotel, ClipboardList, Plane, LucideIcon } from 'lucide-react';

const SegmentIcons: Record<string, LucideIcon> = {
  TRANSPORT: Car,
  DINING: Utensils,
  EXPERIENCE: Sparkles,
  ACCOMMODATION: Hotel,
  LOGISTICS: ClipboardList,
  FLIGHT: Plane,
  // Add more mappings as needed
};

const DefaultIcon = Sparkles; // Fallback icon

/**
 * TimelineView Component
 * Renders the itinerary segments in a chronological vertical list grouped by day.
 * Supports Phase 4 logic for risk tolerance buffers.
 */
export default function TimelineView({
  segments,
  riskTolerance,
  viewMode,
  partySize = 1,
}: TimelineViewProps) {
  // Extract unique days and sort them
  const days = Array.from(new Set(segments.map((s) => s.day))).sort((a, b) => a - b);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-muted-foreground">
        <p className="text-lg font-medium">Your timeline is empty.</p>
        <p className="text-sm">Tell the Architect what you want to do!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 py-4">
      {days.map((day) => (
        <div key={day} className="flex flex-col gap-4">
          <div className="sticky top-0 z-10 -mx-6 bg-card/80 px-6 py-2 backdrop-blur-md border-y border-border/20">
            <h2 className="text-lg font-bold text-foreground">Day {day}</h2>
          </div>

          <div className="relative space-y-4 pl-6 border-l-2 border-border">
            {segments
              .filter((s) => s.day === day)
              .map((event, idx) => (
                <div
                  key={`${day}-${idx}`}
                  className="relative rounded-xl border border-border bg-card/50 p-4 shadow-sm transition-all hover:shadow-md hover:bg-card"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {React.createElement(SegmentIcons[event.segment] || DefaultIcon, {
                          className: 'w-3 h-3',
                        })}
                        {event.segment.replace('_', ' ')}
                      </span>
                      <h4 className="font-semibold text-foreground">{event.details.name}</h4>
                      <p className="text-sm text-muted-foreground">{event.details.category} • {event.details.city}</p>
                    </div>
                    <div className="text-right">
                      <time className="text-sm font-semibold text-foreground/80">
                        {event.schedule.local_start_time}
                      </time>
                      {event.details.price && (
                        <p className="text-sm font-bold text-emerald-600">
                          {event.details.price.currency}{' '}
                          {viewMode === 'total'
                            ? event.details.price.amount.toLocaleString()
                            : (event.details.price.amount / Math.max(1, partySize)).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Indication for the Retreat Rule (from ARCHITECT_PROMPT logic) */}
                  {riskTolerance === 'relaxed' && event.details.name.toLowerCase().includes('retreat') && (
                    <div className="mt-3 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold uppercase text-amber-600 border border-amber-100">
                      Mandatory Retreat Block (16:00 - 18:30)
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
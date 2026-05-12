'use client';

import React, { useState } from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { API_CONFIG } from '@/config/constants';

// Map segment types to Lucide icons
import { Car, Utensils, Sparkles, Hotel, ClipboardList, Plane, LucideIcon, GripVertical, Loader2 } from 'lucide-react';

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
export default function TimelineView() {
  const { viewMode, setItinerary, sessionId, userId, segments, partySize, riskTolerance } = useItineraryData();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isSyncing) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number, targetDay: number) => {
    e.preventDefault();
    if (draggedIndex === null || isSyncing) return;

    const newSegments = [...segments];
    const [draggedItem] = newSegments.splice(draggedIndex, 1);
    const updatedItem = { ...draggedItem, day: targetDay }; // Update day if dragged to a different block

    const insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newSegments.splice(insertIndex, 0, updatedItem);

    // Optimistically update UI and set syncing state
    setItinerary((prev) => ({ ...prev, events: newSegments }));
    setDraggedIndex(null);
    setIsSyncing(true);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}?user_id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: newSegments }),
      });

      if (response.ok) {
        const updatedItinerary = await response.json();
        // Re-sync with the server's response to get validation results
        setItinerary(updatedItinerary);
      } else {
        // On failure, revert to the original state before the drop
        console.error("Failed to sync reordered itinerary.");
        setItinerary((prev) => ({ ...prev, events: segments }));
      }
    } catch (error) {
      console.error("Error syncing itinerary:", error);
      setItinerary((prev) => ({ ...prev, events: segments }));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className={`relative flex flex-col gap-10 py-4 ${isSyncing ? 'opacity-70 pointer-events-none' : ''}`}>
      {isSyncing && (
        <div className="sticky top-4 z-50 flex justify-center w-full transition-all">
          <div className="flex items-center gap-2 bg-primary/90 backdrop-blur-md text-primary-foreground px-4 py-2 rounded-full shadow-lg text-sm font-bold animate-in fade-in slide-in-from-top-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        </div>
      )}
      {days.map((day) => (
        <div key={day} className="flex flex-col gap-4">
          <div className="sticky top-0 z-10 -mx-6 bg-card/80 px-6 py-2 backdrop-blur-md border-y border-border/20">
            <h2 className="text-lg font-bold text-foreground">Day {day}</h2>
          </div>

          <div 
            className="relative space-y-4 pl-6 pb-4 border-l-2 border-border min-h-[60px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, segments.length, day)} // Fallback drop zone at the end of the day block
          >
            {segments
              .map((event, absoluteIndex) => ({ event, absoluteIndex }))
              .filter(({ event }) => event.day === day)
              .map(({ event, absoluteIndex }) => (
                <div
                  key={`${day}-${absoluteIndex}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, absoluteIndex)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    e.stopPropagation(); // Prevent fallback drop zone from firing
                    handleDrop(e, absoluteIndex, day);
                  }}
                  className={`relative rounded-xl border border-border bg-card/50 p-4 shadow-sm transition-all hover:shadow-md hover:bg-card group ${
                    draggedIndex === absoluteIndex ? 'opacity-40 scale-[0.98] border-primary/50' : ''
                  } ${isSyncing ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
                >
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-card border border-border rounded p-0.5 text-muted-foreground shadow-sm z-10">
                    <GripVertical size={14} />
                  </div>
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
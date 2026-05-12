'use client';

import React, { useState } from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { API_CONFIG } from '@/config/constants';

import { Loader2, AlertTriangle } from 'lucide-react';
import TimelineItem from './TimelineItem';

/**
 * TimelineView Component
 * Renders the itinerary segments in a chronological vertical list grouped by day.
 * Supports Phase 4 logic for risk tolerance buffers.
 */
export default function TimelineView() {
  const { itinerary, setItinerary, sessionId, userId, segments, activeSegmentIndex } = useItineraryData();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Auto-scroll the timeline to the focused segment when a map marker is clicked
  React.useEffect(() => {
    if (activeSegmentIndex !== null) {
      const element = document.getElementById(`timeline-item-${activeSegmentIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex]);

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
      
      {/* Validation Errors / Overlap Warnings Banner */}
      {itinerary.is_conflict && itinerary.validation_errors && itinerary.validation_errors.length > 0 && (
        <div className="flex flex-col gap-2 bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 -mt-4 mb-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Schedule Conflicts Detected</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs font-medium opacity-90">
            {itinerary.validation_errors.map((error: string, idx: number) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
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
                <TimelineItem
                  key={`${day}-${absoluteIndex}`}
                  event={event}
                  absoluteIndex={absoluteIndex}
                  day={day}
                  draggedIndex={draggedIndex}
                  isSyncing={isSyncing}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
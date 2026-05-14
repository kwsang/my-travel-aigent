'use client';

import React, { useState } from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { API_CONFIG } from '@/config/constants';

import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import TimelineItem from './TimelineItem';
import { Event } from '@/types';

/**
 * TimelineView Component
 * Renders the itinerary segments in a chronological vertical list grouped by day.
 * Supports Phase 4 logic for risk tolerance buffers.
 */
export default function TimelineView() {
  const { itinerary, setItinerary, sessionId, userId, segments, activeSegmentIndex } = useItineraryData();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const syncTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const activeDay = activeSegmentIndex !== null ? segments[activeSegmentIndex]?.day : null;

  // Auto-scroll the timeline to the focused segment when a map marker is clicked
  React.useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    if (activeSegmentIndex !== null) {
      const segmentDay = segments[activeSegmentIndex]?.day;
      if (segmentDay) {
        // Auto-expand the day if it is currently collapsed
        setCollapsedDays(prev => {
          if (!prev.has(segmentDay)) return prev;
          const next = new Set(prev);
          next.delete(segmentDay);
          return next;
        });
      }

      // Use a slight timeout to ensure the DOM has expanded before scrolling
      scrollTimeout = setTimeout(() => {
        const element = document.getElementById(`timeline-item-${activeSegmentIndex}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    return () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [activeSegmentIndex, segments]);

  // Cleanup the sync timeout on unmount to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  // Determine the baseline start date of the trip for calendar labeling
  const baseTripStartDate = React.useMemo(() => {
    const allStartTimes = segments
      .map((s: Event) => new Date(s.schedule?.local_start_time || ''))
      .filter((d: Date) => !isNaN(d.getTime()));
    
    let d = new Date(2026, 0, 1);
    if (allStartTimes.length > 0) {
      d = new Date(Math.min(...allStartTimes.map(dt => dt.getTime())));
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }, [segments]);

  const toggleDay = (day: number) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  // Extract unique days and sort them
  const days = Array.from(new Set(segments.map((s) => s.day))).sort((a, b) => a - b);
  const hasAnyCollapsed = collapsedDays.size > 0;

  // Memoize grouped segments to prevent O(D * S) filtering loops on every render
  const segmentsByDay = React.useMemo(() => {
    const grouped = new Map<number, { event: Event; absoluteIndex: number }[]>();
    segments.forEach((event, absoluteIndex) => {
      if (!grouped.has(event.day)) grouped.set(event.day, []);
      grouped.get(event.day)!.push({ event, absoluteIndex });
    });
    return grouped;
  }, [segments]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-muted-foreground">
        <p className="text-lg font-medium">Your timeline is empty.</p>
        <p className="text-sm">Tell the Architect what you want to do!</p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, index: number | string) => {
    e.preventDefault();
    setDragOverIndex(index);

    // Auto-expand collapsed days when hovering over them
    if (typeof index === 'string' && index.startsWith('day-')) {
      const dayNum = parseInt(index.split('-')[1], 10);
      if (collapsedDays.has(dayNum)) {
        setCollapsedDays(prev => {
          const next = new Set(prev);
          next.delete(dayNum);
          return next;
        });
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number, targetDay: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    // Deep copy to safely mutate nested schedule objects
    const newSegments = structuredClone(segments);
    
    const originalDay = segments[draggedIndex].day;
    const [draggedItem] = newSegments.splice(draggedIndex, 1);
    draggedItem.day = targetDay; // Update day if dragged to a different block

    const insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newSegments.splice(insertIndex, 0, draggedItem);

    // --- Cascade Time Recalculation ---
    // We recalculate the times for both the day it was removed from, and the day it was dropped into.
    const daysToRecalculate = Array.from(new Set([originalDay, targetDay]));

    daysToRecalculate.forEach(day => {
      const daySegments = newSegments.filter((s: Event) => s.day === day);
      if (daySegments.length === 0) return;

      // Helper to cleanly parse and format "clock time" regardless of the browser's timezone
      const parseLocal = (iso: string) => new Date(iso);
      const formatLocal = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
      };

      // Calculate the base date of the entire trip (Day 1) to accurately shift dates
      const allStartTimes = newSegments
        .map((s: Event) => parseLocal(s.schedule?.local_start_time || ''))
        .filter((d: Date) => !isNaN(d.getTime()));
      
      let tripStartDate = new Date(2026, 0, 1);
      if (allStartTimes.length > 0) {
        tripStartDate = new Date(Math.min(...allStartTimes.map((d: Date) => d.getTime())));
      }
      tripStartDate.setHours(0, 0, 0, 0);

      // Set the anchor time to the first event's start time (or default to 9 AM)
      let currentStartTime = parseLocal(daySegments[0].schedule?.local_start_time || '');
      if (isNaN(currentStartTime.getTime())) {
        currentStartTime = new Date(tripStartDate);
        currentStartTime.setDate(tripStartDate.getDate() + day - 1);
        currentStartTime.setHours(9, 0, 0, 0);
      } else {
        const targetDate = new Date(tripStartDate);
        targetDate.setDate(tripStartDate.getDate() + day - 1);
        currentStartTime.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      }

      daySegments.forEach((seg: Event, idx: number) => {
        // Calculate original duration (fallback to 1 hour if missing)
        const originalStart = parseLocal(seg.schedule?.local_start_time || '');
        const originalEnd = parseLocal(seg.schedule?.local_end_time || '');
        let durationMs = originalEnd.getTime() - originalStart.getTime();
        if (isNaN(durationMs) || durationMs <= 0) durationMs = 60 * 60 * 1000; 

        // Apply transit buffer for subsequent items (default 30 mins if the AI didn't provide one)
        if (idx > 0) {
          const bufferMins = seg.schedule?.applied_buffer_minutes || 30;
          currentStartTime = new Date(currentStartTime.getTime() + bufferMins * 60 * 1000);
        }

        // Update the segment's schedule
        if (!seg.schedule) {
          seg.schedule = {
            local_start_time: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Fallback to user's local browser timezone
          };
        }
        seg.schedule.local_start_time = formatLocal(currentStartTime);
        
        currentStartTime = new Date(currentStartTime.getTime() + durationMs);
        seg.schedule.local_end_time = formatLocal(currentStartTime);
      });
    });
    // --- End Cascade Recalculation ---

    // Re-sort the segments by day to prevent absolute indexing desync in the UI
    newSegments.sort((a: Event, b: Event) => a.day - b.day);

    // Optimistically update UI, clear conflicts, and set syncing state
    setItinerary((prev) => ({ 
      ...prev, 
      events: newSegments,
      is_conflict: false,
      validation_errors: []
    }));
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsSyncing(true);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Debounce the backend API call by 1.5 seconds
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}?user_id=${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: newSegments }),
        });

        if (response.ok) {
          const updatedItinerary = await response.json();
          // Re-sync with the server's response to get validation results back
          setItinerary(updatedItinerary);
        } else {
          console.error("Failed to sync reordered itinerary.");
        }
      } catch (error) {
        console.error("Error syncing itinerary:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 1500);
  };

  return (
    <div className={`relative flex flex-col gap-10 py-4 transition-opacity ${isSyncing ? 'opacity-90' : ''}`}>
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

      {/* Expand / Collapse All */}
      {days.length > 1 && (
        <div className="flex justify-end -mb-6 z-10 relative">
          <button
            onClick={() => hasAnyCollapsed ? setCollapsedDays(new Set()) : setCollapsedDays(new Set(days))}
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5"
          >
            {hasAnyCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      )}

      {days.map((day) => {
        const isCollapsed = collapsedDays.has(day);
        const dayDate = new Date(baseTripStartDate);
        dayDate.setDate(baseTripStartDate.getDate() + day - 1);
        const dateString = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        return (
          <div key={day} className="flex flex-col gap-4">
            <div 
              className={`sticky top-0 z-10 -mx-6 px-6 py-2 backdrop-blur-md border-y cursor-pointer flex items-center justify-between transition-colors select-none group ${
                activeDay === day 
                  ? 'bg-primary/15 border-primary/30 shadow-sm' 
                  : 'bg-card/80 border-border/20 hover:bg-white/5'
              }`}
              onClick={() => toggleDay(day)}
              onDragEnter={(e) => handleDragEnter(e, `day-${day}`)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, segments.length, day)}
            >
              <div className="flex items-baseline gap-2">
                <h2 className={`text-lg font-bold ${activeDay === day ? 'text-primary' : 'text-foreground'}`}>Day {day}</h2>
                <span className={`text-sm font-medium ${activeDay === day ? 'text-primary/80' : 'text-muted-foreground'}`}>{dateString}</span>
              </div>
              <ChevronDown size={18} className={`transition-transform duration-200 ${activeDay === day ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} ${isCollapsed ? '-rotate-90' : ''}`} />
            </div>

            {!isCollapsed && (
              <div 
                className={`relative space-y-4 pl-6 pb-4 border-l-2 border-border min-h-[60px] rounded-br-xl transition-all ${
                  dragOverIndex === `day-${day}` ? 'pb-20 after:content-["Drop_Here"] after:flex after:items-center after:justify-center after:text-[11px] after:font-bold after:text-primary after:uppercase after:tracking-widest after:absolute after:bottom-4 after:left-6 after:right-0 after:h-12 after:border-2 after:border-dashed after:border-primary/60 after:rounded-xl after:bg-primary/10' : ''
                }`}
                onDragEnter={(e) => handleDragEnter(e, `day-${day}`)}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, segments.length, day)} // Fallback drop zone at the end of the day block
              >
                {segmentsByDay.get(day)?.map(({ event, absoluteIndex }) => (
                    <TimelineItem
                      key={`${day}-${absoluteIndex}`}
                      event={event}
                      absoluteIndex={absoluteIndex}
                      day={day}
                      draggedIndex={draggedIndex}
                      dragOverIndex={dragOverIndex}
                      isSyncing={isSyncing}
                      onDragStart={handleDragStart}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
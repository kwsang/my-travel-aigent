'use client';

import React, { useState } from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { API_CONFIG } from '@/config/constants';

import { Loader2, AlertTriangle, ChevronDown, CalendarRange } from 'lucide-react';
import TimelineItem from './TimelineItem';
import { formatTime } from '@/utils/dateUtils';
import { Event } from '@/types';
import { recalculateTimelineCascade } from './timelineUtils';
import { useTimelineSync } from '@/hooks/useTimelineSync';

/**
 * TimelineView Component
 * Renders the itinerary segments in a chronological vertical list grouped by day.
 * Supports Phase 4 logic for risk tolerance buffers.
 */
export default function TimelineView() {
  const { itinerary, setItinerary, sessionId, userId, segments, activeSegmentIndex, profile, viewMode, partySize, expandedDays, setExpandedDays } = useItineraryData();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | string | null>(null);
  
  const activeDay = activeSegmentIndex !== null ? segments[activeSegmentIndex]?.day : null;
  const { isSyncing, syncItinerary } = useTimelineSync(sessionId, userId, setItinerary);

  // Auto-scroll the timeline to the focused segment when a map marker is clicked
  React.useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    if (activeSegmentIndex !== null) {
      const segmentDay = segments[activeSegmentIndex]?.day;
      if (segmentDay) {
        // Auto-expand the day if it is currently collapsed
        setExpandedDays(prev => {
          if (prev.has(segmentDay)) return prev;
          const next = new Set(prev);
          next.add(segmentDay);
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

  const prevSegmentsRef = React.useRef(segments);

  // Auto-expand all days on initial mount
  React.useEffect(() => {
    const allDays = new Set(segments.map(s => s.day));
    const targetDuration = profile?.preferences?.target_duration_days || itinerary?.duration_days || 0;
    const maxDay = Math.max(allDays.size > 0 ? Math.max(...Array.from(allDays)) : 0, targetDuration);
    
    if (maxDay > 0) {
      setExpandedDays(prev => {
        if (prev.size === 0) {
          const next = new Set(prev);
          for (let i = 1; i <= maxDay; i++) next.add(i);
          return next;
        }
        return prev;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-expand days when new items are added to them
  React.useEffect(() => {
    const prevSegments = prevSegmentsRef.current;
    if (segments !== prevSegments) {
      const addedDays = new Set<number>();
      
      const prevDayCounts = new Map<number, number>();
      prevSegments.forEach(s => prevDayCounts.set(s.day, (prevDayCounts.get(s.day) || 0) + 1));
      
      const currDayCounts = new Map<number, number>();
      segments.forEach(s => currDayCounts.set(s.day, (currDayCounts.get(s.day) || 0) + 1));
      
      currDayCounts.forEach((count, day) => {
        if (count > (prevDayCounts.get(day) || 0)) {
          addedDays.add(day);
        }
      });

      if (addedDays.size > 0) {
        setExpandedDays(prev => {
          const next = new Set(prev);
          addedDays.forEach(day => next.add(day));
          return next;
        });
      }

      prevSegmentsRef.current = segments;
    }
  }, [segments]);

  // Determine the baseline start date of the trip for calendar labeling
  const baseTripStartDate = React.useMemo(() => {
    // First check if user explicitly set a start date in their profile
    if (profile?.preferences?.start_date) {
      const [year, month, day] = profile.preferences.start_date.split('-');
      // Use UTC to prevent browser timezone offsets from shifting midnight backwards
      return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    }

    const allStartTimes = segments
      .map((s: Event) => new Date(s.schedule?.local_start_time || ''))
      .filter((d: Date) => !isNaN(d.getTime()));
    
    let d = new Date(Date.UTC(2026, 0, 1));
    if (allStartTimes.length > 0) {
      const earliest = new Date(Math.min(...allStartTimes.map(dt => dt.getTime())));
      d = new Date(Date.UTC(earliest.getFullYear(), earliest.getMonth(), earliest.getDate()));
    }
    return d;
  }, [segments, profile?.preferences?.start_date]);

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  // Extract unique days and sort them
  let days = Array.from(new Set(segments.map((s) => s.day))).sort((a, b) => a - b);
  const targetDuration = profile?.preferences?.target_duration_days || itinerary?.duration_days || 0;
  if (targetDuration > 0) {
    const maxDay = Math.max(days.length > 0 ? Math.max(...days) : 0, targetDuration);
    days = Array.from({ length: maxDay }, (_, i) => i + 1);
  }
  const hasAnyCollapsed = expandedDays.size < days.length;

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)))
      .toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const dateHeader = profile?.preferences?.start_date && profile?.preferences?.end_date ? (
    <div className="flex items-center justify-between bg-card/80 backdrop-blur-md border border-border rounded-xl px-4 py-3 mb-2 shadow-sm animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center gap-3">
        <div className="bg-primary/20 p-2 rounded-lg text-primary">
          <CalendarRange size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trip Dates</span>
          <span className="text-sm font-bold text-foreground">
            {formatDateString(profile.preferences.start_date)} — {formatDateString(profile.preferences.end_date)}
          </span>
        </div>
      </div>
      <div className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-md border border-primary/20">
        {profile.preferences.target_duration_days} Days
      </div>
    </div>
  ) : null;

  // Extract and group validation errors by day
  const globalErrors: string[] = [];
  const dayErrors = new Map<number, string[]>();

  if (itinerary.is_conflict && itinerary.validation_errors) {
    itinerary.validation_errors.forEach((error: string) => {
      const match = error.match(/Day (\d+)/i);
      if (match) {
        const dayNum = parseInt(match[1], 10);
        if (!dayErrors.has(dayNum)) dayErrors.set(dayNum, []);
        dayErrors.get(dayNum)!.push(error);
      } else {
        globalErrors.push(error);
      }
    });
  }

  // Memoize grouped segments to prevent O(D * S) filtering loops on every render
  const segmentsByDay = React.useMemo(() => {
    const grouped = new Map<number, { event: Event; absoluteIndex: number; time: number }[]>();
    segments.forEach((event, absoluteIndex) => {
      if (!grouped.has(event.day)) grouped.set(event.day, []);
      const time = event.schedule?.local_start_time ? new Date(event.schedule.local_start_time).getTime() : 0;
      grouped.get(event.day)!.push({ event, absoluteIndex, time });
    });
    return grouped;
  }, [segments]);

  if (segments.length === 0 && days.length === 0) {
    return (
      <div className="flex flex-col gap-4 py-4">
        {dateHeader}
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-muted-foreground">
          <p className="text-lg font-medium">Your timeline is empty.</p>
          <p className="text-sm">Tell the Architect what you want to do!</p>
        </div>
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
      if (!expandedDays.has(dayNum)) {
        setExpandedDays(prev => {
          const next = new Set(prev);
          next.add(dayNum);
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
    recalculateTimelineCascade(newSegments, originalDay, targetDay);
    // --- End Cascade Recalculation ---

    // Re-sort the segments by day and time to prevent absolute indexing desync in the UI
    newSegments.sort((a: Event, b: Event) => {
      if (a.day !== b.day) return a.day - b.day;
      const timeA = a.schedule?.local_start_time ? new Date(a.schedule.local_start_time).getTime() : 0;
      const timeB = b.schedule?.local_start_time ? new Date(b.schedule.local_start_time).getTime() : 0;
      return timeA - timeB;
    });

    // Optimistically update UI, clear conflicts, and set syncing state
    setItinerary((prev) => ({ 
      ...prev, 
      events: newSegments,
      is_conflict: false,
      validation_errors: []
    }));
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Trigger debounced API sync
    syncItinerary(newSegments);

    // Communicate the move to the agent
    window.dispatchEvent(new CustomEvent('travel_aigent_timeline_drag_drop', {
      detail: { item: draggedItem, originalDay, targetDay, updatedSegments: newSegments }
    }));
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
      
      {dateHeader}

      {/* Global Validation Errors / Budget Warnings Banner */}
      {globalErrors.length > 0 && (
        <div className="flex flex-col gap-2 bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 -mt-4 mb-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Trip Warnings</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs font-medium opacity-90">
            {globalErrors.map((error: string, idx: number) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand / Collapse All */}
      {days.length > 1 && (
        <div className="flex justify-end -mb-6 z-10 relative">
          <button
            onClick={() => hasAnyCollapsed ? setExpandedDays(new Set(days)) : setExpandedDays(new Set())}
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5"
          >
            {hasAnyCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      )}

      {days.map((day) => {
        const isCollapsed = !expandedDays.has(day);
        const dayDate = new Date(baseTripStartDate);
        dayDate.setUTCDate(baseTripStartDate.getUTCDate() + day - 1);
        const dateString = dayDate.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });

        const dayEvents = segmentsByDay.get(day) || [];
        let dailyTotal = 0;
        let currency = 'USD';
        dayEvents.forEach(({ event }) => {
          if (event.details?.price && typeof event.details.price === 'object' && typeof event.details.price.amount === 'number') {
            dailyTotal += viewMode === 'total' 
              ? event.details.price.amount 
              : event.details.price.amount / Math.max(1, partySize);
            currency = event.details.price.currency || currency;
          }
        });

        const isEmptyDay = dayEvents.length === 0;
        const isDragOverDay = dragOverIndex === `day-${day}`;

        return (
          <div key={day} className={`flex flex-col gap-4 transition-opacity duration-300 ${isEmptyDay && !isDragOverDay ? 'opacity-50 hover:opacity-100' : ''}`}>
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
              <div className="flex items-center gap-3">
                {dailyTotal > 0 && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shadow-sm">
                    {currency === 'USD' ? '$' : `${currency} `}{dailyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
                <ChevronDown size={18} className={`transition-transform duration-200 ${activeDay === day ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} ${isCollapsed ? '-rotate-90' : ''}`} />
              </div>
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
                {dayErrors.has(day) && (
                  <div className="flex flex-col gap-1.5 bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg shadow-sm mb-4">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Schedule Conflicts</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-medium opacity-90">
                      {dayErrors.get(day)!.map((error: string, idx: number) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(() => {
                  const items: { time: number, node: React.ReactNode }[] = [];
                  
                  
                  segmentsByDay.get(day)?.forEach(({ event, absoluteIndex, time }) => {
                    items.push({
                      time,
                      node: (
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
                      )
                    });
                  });
                  
                  items.sort((a, b) => a.time - b.time);
                  return items.map(item => item.node);
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
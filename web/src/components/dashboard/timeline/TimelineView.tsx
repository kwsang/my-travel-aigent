'use client';

import React, { useState } from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { API_CONFIG } from '@/config/constants';

import { Loader2 } from 'lucide-react';
import { Event } from '@/types';
import { useTimelineSync } from '@/hooks/useTimelineSync';
import TimelineSkeleton from './TimelineSkeleton';
import TimelineHeader from './TimelineHeader';
import TimelineGlobalErrors from './TimelineGlobalErrors';
import TimelineDayBlock from './TimelineDayBlock';
import { useTimelineDragDrop } from '@/hooks/useTimelineDragDrop';
import { useBaseTripStartDate } from '@/hooks/useBaseTripStartDate';

/**
 * TimelineView Component
 * Renders the itinerary segments in a chronological vertical list grouped by day.
 * Supports Phase 4 logic for risk tolerance buffers.
 */
export default function TimelineView() {
  const { itinerary, setItinerary, sessionId, userId, segments, activeSegmentIndex, profile, viewMode, partySize, expandedDays, setExpandedDays } = useItineraryData();
  
  const activeDay = activeSegmentIndex !== null ? segments[activeSegmentIndex]?.day : null;
  const { isSyncing, syncItinerary } = useTimelineSync(sessionId, userId, setItinerary);

  const [isGenerating, setIsGenerating] = useState(false);

  React.useEffect(() => {
    const handleStart = () => setIsGenerating(true);
    const handleStop = () => setIsGenerating(false);

    window.addEventListener('travel_aigent_generation_start', handleStart);
    window.addEventListener('travel_aigent_generation_end', handleStop);

    return () => {
      window.removeEventListener('travel_aigent_generation_start', handleStart);
      window.removeEventListener('travel_aigent_generation_end', handleStop);
    };
  }, []);

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

  const baseTripStartDate = useBaseTripStartDate(segments, profile);

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const dragDrop = useTimelineDragDrop(segments, setItinerary, syncItinerary, expandedDays, setExpandedDays);

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

  // Extract unique days and sort them
  let days = Array.from(new Set(segments.map((s) => s.day))).sort((a, b) => a - b);
  const targetDuration = profile?.preferences?.target_duration_days || itinerary?.duration_days || 0;
  if (targetDuration > 0) {
    const maxDay = Math.max(days.length > 0 ? Math.max(...days) : 0, targetDuration);
    days = Array.from({ length: maxDay }, (_, i) => i + 1);
  }
  const hasAnyCollapsed = expandedDays.size < days.length;

  // Calculate the current progress of the agent
  const maxDayPlanned = React.useMemo(() => {
    const activityDays = segments
      .filter(s => ['EXPERIENCE', 'DINING'].includes(s.segment))
      .map(s => s.day);
    return activityDays.length > 0 ? Math.max(...activityDays) : 0;
  }, [segments]);

  const planningProgress = targetDuration > 0 ? Math.max(5, Math.min(100, Math.round((maxDayPlanned / targetDuration) * 100))) : (isGenerating ? 100 : 0);

  if (segments.length === 0 && days.length === 0) {
    if (isGenerating) {
      return (
        <div className="py-4">
          <TimelineHeader profile={profile} />
          <TimelineSkeleton />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4 py-4">
        <TimelineHeader profile={profile} />
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-muted-foreground">
          <p className="text-lg font-medium">Your timeline is empty.</p>
          <p className="text-sm">Tell the Architect what you want to do!</p>
        </div>
      </div>
    );
  }

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
      
      <TimelineHeader profile={profile} />

      {/* Agent Planning Progress Bar */}
      {isGenerating && (
        <div className="flex flex-col gap-2 -mt-4 mb-2 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-primary">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Agent is planning...
            </span>
            {targetDuration > 0 && <span>{Math.min(maxDayPlanned, targetDuration)} / {targetDuration} Days</span>}
          </div>
          <div className="w-full bg-primary/10 rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out rounded-full relative overflow-hidden"
              style={{ width: `${targetDuration > 0 ? planningProgress : 100}%` }}
            >
              <div className="absolute inset-0 bg-white/20 w-full animate-pulse" />
            </div>
          </div>
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

        return (
          <TimelineDayBlock
            key={day}
            day={day}
            dateString={dateString}
            dayEvents={dayEvents}
            activeDay={activeDay}
            isCollapsed={isCollapsed}
            toggleDay={toggleDay}
            viewMode={viewMode}
            partySize={partySize}
            dragOverIndex={dragDrop.dragOverIndex}
            draggedIndex={dragDrop.draggedIndex}
            dayErrors={dayErrors.get(day) || []}
            isSyncing={isSyncing}
            segmentsLength={segments.length}
            onDragStart={dragDrop.handleDragStart}
            onDragEnter={dragDrop.handleDragEnter}
            onDragLeave={dragDrop.handleDragLeave}
            onDragEnd={dragDrop.handleDragEnd}
            onDragOver={dragDrop.handleDragOver}
            onDrop={dragDrop.handleDrop}
          />
        );
      })}

      {/* Global Validation Errors / Budget Warnings Banner */}
      <TimelineGlobalErrors errors={globalErrors} />
    </div>
  );
}
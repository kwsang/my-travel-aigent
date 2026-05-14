import { Event } from '@/types';

// Helper to cleanly parse and format "clock time" regardless of the browser's timezone
const parseLocal = (iso: string) => new Date(iso);
const formatLocal = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};

/**
 * Recalculates start and end times for all events on the affected days, 
 * cascading transit buffers down the timeline so no events overlap.
 */
export function recalculateTimelineCascade(newSegments: Event[], originalDay: number, targetDay: number): Event[] {
  const daysToRecalculate = Array.from(new Set([originalDay, targetDay]));

  daysToRecalculate.forEach(day => {
    const daySegments = newSegments.filter((s: Event) => s.day === day);
    if (daySegments.length === 0) return;

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

  return newSegments;
}
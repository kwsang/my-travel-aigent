import { useMemo } from 'react';
import { Event } from '@/types';

export function useBaseTripStartDate(segments: Event[], profile: any): Date {
  return useMemo(() => {
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
}
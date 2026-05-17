import React from 'react';
import { CalendarRange } from 'lucide-react';
import { TravelerProfile } from '@/types';

interface TimelineHeaderProps {
  profile: TravelerProfile | null | undefined;
}

export default function TimelineHeader({ profile }: TimelineHeaderProps) {
  if (!profile?.preferences?.start_date || !profile?.preferences?.end_date) return null;

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)))
      .toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
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
  );
}
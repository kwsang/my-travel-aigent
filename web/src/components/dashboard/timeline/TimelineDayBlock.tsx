import React from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import TimelineItem from './TimelineItem';
import { Event } from '@/types';

interface TimelineDayBlockProps {
  day: number;
  dateString: string;
  dayEvents: { event: Event; absoluteIndex: number; time: number }[];
  activeDay: number | null;
  isCollapsed: boolean;
  toggleDay: (day: number) => void;
  viewMode: 'total' | 'per_person';
  partySize: number;
  dragOverIndex: number | string | null;
  draggedIndex: number | null;
  dayErrors: string[];
  isSyncing: boolean;
  segmentsLength: number;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragEnter: (e: React.DragEvent, index: number | string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetIndex: number, targetDay: number) => void;
}

export default function TimelineDayBlock({
  day,
  dateString,
  dayEvents,
  activeDay,
  isCollapsed,
  toggleDay,
  viewMode,
  partySize,
  dragOverIndex,
  draggedIndex,
  dayErrors,
  isSyncing,
  segmentsLength,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDragEnd,
  onDragOver,
  onDrop
}: TimelineDayBlockProps) {
  let dailyTotal = 0;
  let currency = 'USD';
  dayEvents.forEach(({ event }) => {
    if (event.details?.price && typeof event.details.price === 'object' && typeof event.details.price.amount === 'number') {
      dailyTotal += viewMode === 'total' ? event.details.price.amount : event.details.price.amount / Math.max(1, partySize);
      currency = event.details.price.currency || currency;
    }
  });

  const isEmptyDay = dayEvents.length === 0;
  const isDragOverDay = dragOverIndex === `day-${day}`;

  return (
    <div className={`flex flex-col gap-4 transition-opacity duration-300 ${isEmptyDay && !isDragOverDay ? 'opacity-50 hover:opacity-100' : ''}`}>
      <div 
        className={`sticky top-0 z-10 -mx-6 px-6 py-2 backdrop-blur-md border-y cursor-pointer flex items-center justify-between transition-colors select-none group ${activeDay === day ? 'bg-primary/15 border-primary/30 shadow-sm' : 'bg-card/80 border-border/20 hover:bg-white/5'}`}
        onClick={() => toggleDay(day)}
        onDragEnter={(e) => onDragEnter(e, `day-${day}`)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, segmentsLength, day)}
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
          className={`relative space-y-4 pl-6 pb-4 border-l-2 border-border min-h-[60px] rounded-br-xl transition-all ${dragOverIndex === `day-${day}` ? 'pb-20 after:content-["Drop_Here"] after:flex after:items-center after:justify-center after:text-[11px] after:font-bold after:text-primary after:uppercase after:tracking-widest after:absolute after:bottom-4 after:left-6 after:right-0 after:h-12 after:border-2 after:border-dashed after:border-primary/60 after:rounded-xl after:bg-primary/10' : ''}`}
          onDragEnter={(e) => onDragEnter(e, `day-${day}`)}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, segmentsLength, day)}
        >
          {dayErrors.length > 0 && (
            <div className="flex flex-col gap-1.5 bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg shadow-sm mb-4">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Schedule Conflicts</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-medium opacity-90">
                {dayErrors.map((error: string, idx: number) => <li key={idx}>{error}</li>)}
              </ul>
            </div>
          )}
          {(() => {
            const items = dayEvents.map(({ event, absoluteIndex, time }) => ({
              time,
              node: <TimelineItem key={`${day}-${absoluteIndex}`} event={event} absoluteIndex={absoluteIndex} day={day} draggedIndex={draggedIndex} dragOverIndex={dragOverIndex} isSyncing={isSyncing} onDragStart={onDragStart} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} />
            }));
            items.sort((a, b) => a.time - b.time);
            return items.map(item => item.node);
          })()}
        </div>
      )}
    </div>
  );
}
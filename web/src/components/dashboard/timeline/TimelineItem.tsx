import React from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { Car, Utensils, Sparkles, Hotel, ClipboardList, Plane, LucideIcon, GripVertical } from 'lucide-react';
import { Event } from '@/types';

// Map segment types to Lucide icons
const SegmentIcons: Record<string, LucideIcon> = {
  TRANSPORT: Car,
  DINING: Utensils,
  EXPERIENCE: Sparkles,
  ACCOMMODATION: Hotel,
  LOGISTICS: ClipboardList,
  FLIGHT: Plane,
};

const DefaultIcon = Sparkles; // Fallback icon

interface TimelineItemProps {
  event: Event;
  absoluteIndex: number;
  day: number;
  draggedIndex: number | null;
  dragOverIndex: number | string | null;
  isSyncing: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragEnter: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetIndex: number, targetDay: number) => void;
}

export default function TimelineItem({
  event,
  absoluteIndex,
  day,
  draggedIndex,
  dragOverIndex,
  isSyncing,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDragEnd,
  onDragOver,
  onDrop,
}: TimelineItemProps) {
  const { viewMode, partySize, riskTolerance, activeSegmentIndex, setActiveSegmentIndex } = useItineraryData();

  // Formats raw ISO strings into a clean "09:00 AM" format
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return timeStr;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  return (
    <div
      id={`timeline-item-${absoluteIndex}`}
      draggable
      onDragStart={(e) => onDragStart(e, absoluteIndex)}
      onDragEnter={(e) => onDragEnter(e, absoluteIndex)}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.stopPropagation(); // Prevent fallback drop zone from firing
        onDrop(e, absoluteIndex, day);
      }}
      onClick={() => setActiveSegmentIndex(absoluteIndex)}
      className={`relative rounded-xl border border-border bg-card/50 p-4 shadow-sm transition-all hover:shadow-md hover:bg-card cursor-pointer group ${
        draggedIndex === absoluteIndex ? 'opacity-40 scale-[0.98] border-primary/50' : ''
      } ${
        dragOverIndex === absoluteIndex && draggedIndex !== absoluteIndex ? 'mt-8 border-t-2 border-t-primary shadow-[0_-5px_15px_-3px_rgba(var(--primary),0.2)] bg-primary/5' : ''
      } ${activeSegmentIndex === absoluteIndex ? 'ring-2 ring-primary shadow-md bg-card' : ''} ${isSyncing ? 'cursor-wait' : 'active:cursor-grab'}`}
    >
      <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-card border border-border rounded p-0.5 text-muted-foreground shadow-sm z-10">
        <GripVertical size={14} />
      </div>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {React.createElement(SegmentIcons[event.segment] || DefaultIcon, { className: 'w-3 h-3' })}
            {event.segment.replace('_', ' ')}
          </span>
          <h4 className="font-semibold text-foreground">{event.details.name}</h4>
          <p className="text-sm text-muted-foreground">{event.details.category} • {event.details.city}</p>
        </div>
        <div className="text-right">
          <time className="text-sm font-semibold text-foreground/80">{formatTime(event.schedule.local_start_time)}</time>
          {event.details.price && (
            <p className="text-sm font-bold text-emerald-600">
              {event.details.price.currency}{' '}
              {viewMode === 'total' ? event.details.price.amount.toLocaleString() : (event.details.price.amount / Math.max(1, partySize)).toLocaleString()}
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
  );
}
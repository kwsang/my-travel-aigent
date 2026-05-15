import React from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { Sparkles, GripVertical, Star } from 'lucide-react';
import { Event } from '@/types';
import { SegmentType, SegmentIcons, SegmentColors } from '@/components/dashboard/utils/segmentMapping';
import { formatTime } from '@/utils/dateUtils';

const DefaultIcon = Sparkles; // Fallback icon

const formatStringPrice = (priceVal: any) => {
  const str = String(priceVal);
  if (str === 'PRICE_LEVEL_FREE') return 'Free';
  if (str === 'PRICE_LEVEL_INEXPENSIVE') return '$';
  if (str === 'PRICE_LEVEL_MODERATE') return '$$';
  if (str === 'PRICE_LEVEL_EXPENSIVE') return '$$$';
  if (str === 'PRICE_LEVEL_VERY_EXPENSIVE') return '$$$$';
  return str;
};

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
  const itineraryData = useItineraryData();
  const { viewMode, partySize, riskTolerance, activeSegmentIndex, setActiveSegmentIndex, hoveredSegmentIndex, setHoveredSegmentIndex } = itineraryData;

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
      onMouseEnter={() => setHoveredSegmentIndex?.(absoluteIndex)}
      onMouseLeave={() => setHoveredSegmentIndex?.(null)}
      className={`relative rounded-xl border border-border bg-card/50 p-4 shadow-sm transition-all cursor-pointer active:cursor-grab group ${
        draggedIndex === absoluteIndex ? 'opacity-40 scale-[0.98] border-primary/50' : ''
      } ${
        dragOverIndex === absoluteIndex && draggedIndex !== absoluteIndex ? 'mt-20 before:content-["Drop_Here"] before:flex before:items-center before:justify-center before:text-[11px] before:font-bold before:text-primary before:uppercase before:tracking-widest before:absolute before:-top-16 before:left-0 before:right-0 before:h-12 before:border-2 before:border-dashed before:border-primary/60 before:rounded-xl before:bg-primary/10' : ''
      } ${
        activeSegmentIndex === absoluteIndex 
          ? 'ring-2 ring-primary shadow-md bg-card' 
          : (hoveredSegmentIndex === absoluteIndex ? 'ring-1 ring-primary/50 shadow-md bg-card' : 'hover:shadow-md hover:bg-card')
      }`}
    >
      <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-card border border-border rounded p-0.5 text-muted-foreground shadow-sm z-10">
        <GripVertical size={14} />
      </div>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span 
            className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
            style={{ color: SegmentColors[event.segment as SegmentType]?.bg }}
          >
            {React.createElement(SegmentIcons[event.segment as SegmentType] || DefaultIcon, { className: 'w-3 h-3' })}
            {event.segment.replace('_', ' ')}
          </span>
          <h4 className="font-semibold text-foreground">{event.details?.name || 'Unnamed Event'}</h4>
          <p className="text-sm text-muted-foreground">{event.details?.category} {event.details?.city ? `• ${event.details.city}` : ''}</p>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <time className="text-sm font-semibold text-foreground/80">{formatTime(event.schedule?.local_start_time)}</time>
          {event.details?.rating && (
            <div className="flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20 shadow-sm">
              <Star size={10} className="fill-amber-500" />
              <span>{event.details.rating}</span>
              {event.details.user_rating_count && (
                <span className="opacity-70 font-medium">({event.details.user_rating_count})</span>
              )}
            </div>
          )}
          {event.details?.price && (
            <p className="text-sm font-bold text-emerald-600">
              {typeof event.details.price === 'object' ? (
                <>
                  {event.details.price.currency}{' '}
                  {viewMode === 'total' 
                    ? event.details.price.amount?.toLocaleString() 
                    : (event.details.price.amount / Math.max(1, partySize))?.toLocaleString()}
                </>
              ) : (
                formatStringPrice(event.details.price)
              )}
            </p>
          )}
        </div>
      </div>
      {/* Indication for the Retreat Rule (from ARCHITECT_PROMPT logic) */}
      {riskTolerance === 'relaxed' && event.details?.name?.toLowerCase().includes('retreat') && (
        <div className="mt-3 rounded-md bg-destructive/10 px-2 py-1 text-xs font-bold uppercase text-destructive border border-destructive/20">
          Mandatory Retreat Block (16:00 - 18:30)
        </div>
      )}
    </div>
  );
}
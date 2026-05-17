import React from 'react';
import { useItineraryData } from '@/context/ItineraryContext';
import { Sparkles, GripVertical, Star, Plane, AlertTriangle } from 'lucide-react';
import { Event } from '@/types';
import { SegmentType, SegmentIcons, SegmentColors } from '@/components/dashboard/utils/segmentMapping';
import { formatTime } from '@/utils/dateUtils';
import { useTimelineItemEvents } from '@/hooks/useTimelineItemEvents';

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

  // Safely extend details type to avoid 'any' casting for flight-specific fields
  const flightDetails = event.details as typeof event.details & {
    from?: string;
    to?: string;
    airline?: string;
  };

  let effectiveSegment = event.segment as string;
  if (effectiveSegment.includes('DINING') || (effectiveSegment === 'EXPERIENCE' && event.details?.category && ['lunch', 'dinner', 'breakfast', 'brunch', 'dining', 'food', 'meal', 'restaurant', 'cafe'].some(c => event.details!.category!.toLowerCase().includes(c)))) {
    effectiveSegment = 'DINING';
  } else if (effectiveSegment.includes('EXPERIENCE')) {
    effectiveSegment = 'EXPERIENCE';
  }

  const hasConflict = React.useMemo(() => {
    if (!event.details?.name || !itineraryData.itinerary.validation_errors) return false;
    return itineraryData.itinerary.validation_errors.some(err => err.includes(`'${event.details?.name}'`));
  }, [event.details?.name, itineraryData.itinerary.validation_errors]);

  const isDraggable = effectiveSegment !== 'TRANSPORT' && effectiveSegment !== 'FLIGHT';

  const events = useTimelineItemEvents(
    absoluteIndex,
    day,
    isDraggable,
    activeSegmentIndex,
    setActiveSegmentIndex,
    setHoveredSegmentIndex,
    onDragStart,
    onDragEnter,
    onDragLeave,
    onDragEnd,
    onDragOver,
    onDrop
  );

  return (
    <div
      id={`timeline-item-${absoluteIndex}`}
      draggable={isDraggable}
      onDragStart={events.handleDragStart}
      onDragEnter={events.handleDragEnter}
      onDragLeave={events.handleDragLeave}
      onDragEnd={events.handleDragEnd}
      onDragOver={events.handleDragOver}
      onDrop={events.handleDrop}
      onClick={events.handleClick}
      onMouseEnter={events.handleMouseEnter}
      onMouseLeave={events.handleMouseLeave}
      className={`relative rounded-xl border ${effectiveSegment === 'LOGISTICS' ? 'p-2.5' : 'p-4'} shadow-sm transition-all cursor-pointer group ${isDraggable ? 'active:cursor-grab' : ''} ${
        hasConflict 
          ? 'border-destructive/60 bg-destructive/10' 
          : (effectiveSegment === 'FLIGHT' ? 'border-sky-500/30 bg-sky-500/5' : 'border-border bg-card/50')
      } ${
        draggedIndex === absoluteIndex ? 'opacity-40 scale-[0.98] border-primary/50' : ''
      } ${
        dragOverIndex === absoluteIndex && draggedIndex !== absoluteIndex ? 'mt-20 before:content-["Drop_Here"] before:flex before:items-center before:justify-center before:text-[11px] before:font-bold before:text-primary before:uppercase before:tracking-widest before:absolute before:-top-16 before:left-0 before:right-0 before:h-12 before:border-2 before:border-dashed before:border-primary/60 before:rounded-xl before:bg-primary/10' : ''
      } ${
        activeSegmentIndex === absoluteIndex 
          ? 'ring-2 ring-primary shadow-md bg-card' 
          : (hoveredSegmentIndex === absoluteIndex ? 'ring-1 ring-primary/50 shadow-md bg-card' : 'hover:shadow-md hover:bg-card')
      } animate-in fade-in slide-in-from-left-8 duration-500`}
      style={{ animationFillMode: 'backwards', animationDelay: `${(absoluteIndex % 15) * 150}ms` }}
    >
      {isDraggable && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-card border border-border rounded p-0.5 text-muted-foreground shadow-sm z-10">
          <GripVertical size={14} />
        </div>
      )}
      {hasConflict && (
        <div className="absolute -right-2 -top-2 bg-destructive text-destructive-foreground p-1 rounded-full shadow-sm animate-in zoom-in" title="This item has a scheduling conflict">
          <AlertTriangle size={12} />
        </div>
      )}
      <div className="flex items-start justify-between">
      <div className={`flex flex-col ${effectiveSegment === 'LOGISTICS' ? 'gap-0.5' : 'gap-1'}`}>
          <span 
          className={`flex items-center gap-1 font-bold uppercase tracking-wider text-muted-foreground ${effectiveSegment === 'LOGISTICS' ? 'text-[10px]' : 'text-xs'}`}
            style={{ color: SegmentColors[effectiveSegment as SegmentType]?.bg }}
          >
            {React.createElement(SegmentIcons[effectiveSegment as SegmentType] || DefaultIcon, { className: 'w-3 h-3' })}
            {effectiveSegment.replace('_', ' ')}
            {event.details?.category && event.details.category.toLowerCase() !== effectiveSegment.toLowerCase() && (
              <span className="capitalize normal-case tracking-normal opacity-90 ml-0.5">
                ({event.details.category})
              </span>
            )}
          </span>
            <div className="flex items-center gap-2 mt-0.5">
              {event.details?.rating && (
                <div className="flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20 shadow-sm shrink-0">
                  <Star size={10} className="fill-amber-500" />
                  <span>{event.details.rating}</span>
                  {event.details.user_rating_count && (
                    <span className="opacity-70 font-medium">({event.details.user_rating_count})</span>
                  )}
                </div>
              )}
              {effectiveSegment === 'FLIGHT' && flightDetails?.from && flightDetails?.to ? (
                <h4 className="font-semibold text-foreground leading-tight flex items-center gap-2">
                  {flightDetails.from} <Plane size={14} className="text-muted-foreground" /> {flightDetails.to}
                </h4>
              ) : (
            <h4 className={`font-semibold text-foreground leading-tight ${effectiveSegment === 'LOGISTICS' ? 'text-sm' : ''}`}>{event.details?.name || (effectiveSegment === 'FLIGHT' ? 'Flight' : 'Unnamed Event')}</h4>
              )}
            </div>
            {effectiveSegment === 'FLIGHT' && flightDetails?.airline ? (
              <p className="text-sm font-medium text-sky-500/80">{flightDetails.airline}</p>
            ) : (
              <p className={`${effectiveSegment === 'LOGISTICS' ? 'text-xs' : 'text-sm'} text-muted-foreground line-clamp-2`}>
                {event.details?.description || event.details?.notes || (event.details?.city ? `Located in ${event.details.city}` : '')}
              </p>
            )}
          </div>
          <div className="text-right flex flex-col items-end gap-1 shrink-0">
        <div className="flex flex-col items-end">
          <time className={`font-semibold ${
            (effectiveSegment === 'FLIGHT' || effectiveSegment === 'TRANSPORT' || effectiveSegment === 'EXPERIENCE' || effectiveSegment === 'DINING') && event.schedule?.local_end_time 
              ? 'text-foreground/70 text-xs' 
              : 'text-foreground/90 text-sm'
          } ${effectiveSegment === 'LOGISTICS' ? '!text-xs' : ''}`}>
            {formatTime(event.schedule?.local_start_time)}
            {(effectiveSegment === 'FLIGHT' || effectiveSegment === 'TRANSPORT' || effectiveSegment === 'EXPERIENCE' || effectiveSegment === 'DINING') && event.schedule?.timezone && (
              <span className="text-[10px] ml-1 font-normal tracking-wide opacity-80">
                {(() => {
                  try {
                    const d = new Date(event.schedule.start_time_utc || (event.schedule.local_start_time ? event.schedule.local_start_time + 'Z' : Date.now()));
                    const tzPart = new Intl.DateTimeFormat('en-US', { timeZone: event.schedule.timezone, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName');
                    return tzPart ? tzPart.value : '';
                  } catch {
                    return '';
                  }
                })()}
              </span>
            )}
          </time>
          {(effectiveSegment === 'FLIGHT' || effectiveSegment === 'TRANSPORT' || effectiveSegment === 'EXPERIENCE' || effectiveSegment === 'DINING') && event.schedule?.local_end_time && (
            <>
              <time className="font-bold text-foreground mt-0.5 flex items-center gap-1 text-sm">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">to</span>
              <span>{formatTime(event.schedule.local_end_time)}</span>
              {event.schedule.timezone && (
                <span className="text-[9px] font-normal tracking-wide">
                  {(() => {
                    try {
                      const d = new Date(event.schedule.end_time_utc || (event.schedule.local_end_time ? event.schedule.local_end_time + 'Z' : Date.now()));
                      const tzPart = new Intl.DateTimeFormat('en-US', { timeZone: event.schedule.timezone, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName');
                      return tzPart ? tzPart.value : '';
                    } catch {
                      return '';
                    }
                  })()}
                </span>
              )}
              </time>
              {(() => {
                const startStr = event.schedule.start_time_utc || (event.schedule.local_start_time ? event.schedule.local_start_time + 'Z' : null);
                const endStr = event.schedule.end_time_utc || (event.schedule.local_end_time ? event.schedule.local_end_time + 'Z' : null);
                if (!startStr || !endStr) return null;
                
                const start = new Date(startStr).getTime();
                const end = new Date(endStr).getTime();
                if (isNaN(start) || isNaN(end) || end <= start) return null;
                
                const diffMins = Math.floor((end - start) / 60000);
                const h = Math.floor(diffMins / 60);
                const m = diffMins % 60;
                return (
                  <div className="text-[10px] font-medium text-muted-foreground mt-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                    {h > 0 ? `${h}h ` : ''}{m}m
                  </div>
                );
              })()}
            </>
          )}
        </div>
            {event.details?.price && effectiveSegment !== 'LOGISTICS' && effectiveSegment !== 'TRANSPORT' && (
              <p className="text-sm font-bold text-emerald-600 mt-0.5">
                {typeof event.details.price === 'object' ? (
                  <>
                    {event.details.price.currency === 'USD' ? '$' : `${event.details.price.currency} `}
                    {viewMode === 'total' 
                      ? event.details.price.amount?.toLocaleString() 
                      : (event.details.price.amount / Math.max(1, partySize))?.toLocaleString()}
                  </>
                ) : (
                  formatStringPrice(event.details.price)
                )}
              </p>
            )}
            {(effectiveSegment === 'LODGING' || effectiveSegment === 'EXPERIENCE' || effectiveSegment === 'DINING') && event.details?.city && (
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 mt-1">
                {event.details.city.split(',').slice(0, 2).join(',').trim()}
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
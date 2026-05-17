import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { Star, Sparkles } from 'lucide-react';
import { SegmentType, SegmentIcons, SegmentColors } from '@/components/dashboard/utils/segmentMapping';
import { Event } from '@/types';

interface TimelineMarkerProps {
  segment: Event;
  index: number;
  isActive: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  formatPrice: (p: any) => string | null;
}

export default function TimelineMarker({ segment, index, isActive, isHovered, onClick, onMouseEnter, onMouseLeave, formatPrice }: TimelineMarkerProps) {
  const geo = segment.geo || segment.details?.geo;
  if (!geo) return null;
  
  const placeName = segment.details?.name || 'Unnamed Event';
  const price = segment.details?.price;
  const rating = segment.details?.rating;
  const ratingCount = segment.details?.user_rating_count;

  const Icon = SegmentIcons[segment.segment as SegmentType] || Sparkles;
  const bgColor = SegmentColors[segment.segment as SegmentType]?.bg || '#fdb833';

  return (
    <AdvancedMarker
      position={{ lat: geo.latitude, lng: geo.longitude }} 
      title={placeName}
      onClick={onClick}
      zIndex={isActive || isHovered ? 100 : 10}
    >
      <div 
        className="flex flex-col items-center group cursor-pointer"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="relative border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 transition-all" style={{ backgroundColor: bgColor }}>
          <div className="text-white scale-75">
            <Icon className="w-6 h-6" />
          </div>
          {(price || rating) && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
              {price && <span>{formatPrice(price)}</span>}
              {price && rating && <span className="opacity-70">•</span>}
              {rating && <span className="flex items-center gap-0.5"><Star size={9} className="fill-white" /> {rating}{ratingCount && <span className="text-[8px] font-medium opacity-80">({ratingCount})</span>}</span>}
            </div>
          )}
        </div>
        <div className={`bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 whitespace-nowrap shadow-lg transition-opacity ${isActive || isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {placeName}
        </div>
      </div>
    </AdvancedMarker>
  );
}

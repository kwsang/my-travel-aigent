import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { Bed, Utensils, Sparkles, Star } from 'lucide-react';
import { useMapContext } from './MapContext';

interface SuggestionMarkerProps {
  place: any;
  idx: number;
  type: 'lodging' | 'activity';
  onClick: () => void;
}

export default function SuggestionMarker({ place, idx, type, onClick }: SuggestionMarkerProps) {
  const { formatPrice } = useMapContext();
  const geo = place.geo || place.details?.geo || place.location;
  if (!geo) return null;
  
  const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Place';
  const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
  const rating = place.details?.rating || place.rating;
  const ratingCount = place.details?.user_rating_count || place.userRatingCount || place.user_rating_count;

  const isDining = type === 'activity' && place.types?.some((t: string) => ['restaurant', 'cafe', 'food', 'bar', 'bakery'].includes(t));
  
  let Icon = Sparkles;
  let bgClass = 'bg-pink-500';
  let borderHoverClass = 'group-hover:border-pink-300';
  let shadowHoverClass = 'group-hover:shadow-pink-500/30';

  if (type === 'lodging') {
    Icon = Bed;
    bgClass = 'bg-violet-500';
    borderHoverClass = 'group-hover:border-violet-300';
    shadowHoverClass = 'group-hover:shadow-violet-500/30';
  } else if (isDining) {
    Icon = Utensils;
    bgClass = 'bg-amber-500';
    borderHoverClass = 'group-hover:border-amber-300';
    shadowHoverClass = 'group-hover:shadow-amber-500/30';
  }

  return (
    <AdvancedMarker position={{ lat: geo.latitude, lng: geo.longitude }} title={placeName} onClick={onClick}>
      <div className="flex flex-col items-center group animate-in fade-in zoom-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
        <div className={`relative ${bgClass} border-2 border-white shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 ${borderHoverClass} ${shadowHoverClass} transition-all`}>
          <Icon size={18} className="text-white" />
          {(price || rating) && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-400 whitespace-nowrap">
              {price && <span>{formatPrice(price)}</span>}
              {price && rating && <span className="opacity-70">•</span>}
              {rating && <span className="flex items-center gap-0.5"><Star size={9} className="fill-white" /> {rating}{ratingCount && <span className="text-[8px] font-medium opacity-80">({ratingCount})</span>}</span>}
            </div>
          )}
        </div>
        <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">{placeName}</div>
      </div>
    </AdvancedMarker>
  );
}
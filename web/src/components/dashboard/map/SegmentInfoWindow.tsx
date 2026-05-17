import React from 'react';
import { InfoWindow } from '@vis.gl/react-google-maps';
import { Star } from 'lucide-react';
import { Event } from '@/types';

interface SegmentInfoWindowProps {
  segment: Event;
  onClose: () => void;
  formatPrice: (p: any) => string | null;
}

export default function SegmentInfoWindow({ segment, onClose, formatPrice }: SegmentInfoWindowProps) {
  const geo = segment.geo || segment.details?.geo;
  if (!geo) return null;
  
  const placeName = segment.details?.name || 'Unnamed Event';
  const description = segment.details?.description;
  const notes = segment.details?.notes;
  const price = segment.details?.price;
  const rating = segment.details?.rating;
  const category = segment.details?.category;
  const imageUrl = segment.details?.image_url || (segment as any).image_url || (segment.details as any)?.photo_url;
  
  return (
    <InfoWindow position={{ lat: geo.latitude, lng: geo.longitude }} onCloseClick={onClose}>
      <div className="flex flex-col gap-1 p-1 max-w-[200px] text-gray-900">
        {imageUrl && (
          <div className="w-full h-24 mb-1 rounded-sm overflow-hidden bg-muted relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl as string} alt={placeName as string} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <h3 className="font-bold text-sm leading-tight mb-1">{placeName as React.ReactNode}</h3>
        {category && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            <span className="bg-primary/10 text-primary text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm">
              {category as React.ReactNode}
            </span>
          </div>
        )}
        {description && <p className="text-xs opacity-80">{description as React.ReactNode}</p>}
        {notes && <p className="text-xs opacity-80 italic mt-1">Note: {notes as React.ReactNode}</p>}
        {(price || rating) && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 text-xs font-semibold">
            {price && <span>{formatPrice(price)}</span>}
            {price && rating && <span className="opacity-50">•</span>}
            {rating && <span className="flex items-center gap-0.5"><Star size={10} className="fill-amber-500 text-amber-500" /> {rating as React.ReactNode}</span>}
          </div>
        )}
      </div>
    </InfoWindow>
  );
}
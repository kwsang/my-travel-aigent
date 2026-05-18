import React from 'react';
import { InfoWindow } from '@vis.gl/react-google-maps';
import { Star } from 'lucide-react';
import { Event } from '@/types';
import { useMapContext } from './MapContext';

interface SegmentInfoWindowProps {
  segment: Event;
  onClose: () => void;
}

export default function SegmentInfoWindow({ segment, onClose }: SegmentInfoWindowProps) {
  const { formatPrice } = useMapContext();
  const geo = segment.geo || segment.details?.geo;
  if (!geo) return null;
  
  const placeName = segment.details?.name || 'Unnamed Event';
  const description = segment.details?.description;
  const notes = segment.details?.notes;
  const price = segment.details?.price;
  const rating = segment.details?.rating;
  const category = segment.details?.category;
  const imageUrl = segment.details?.image_url || (segment as any).image_url || (segment.details as any)?.photo_url;
  const googleMapsUri = segment.details?.google_maps_uri || (segment as any).google_maps_uri;
  
  return (
    <InfoWindow position={{ lat: geo.latitude, lng: geo.longitude }} onCloseClick={onClose}>
      <div className="flex flex-col p-2 max-w-[240px] text-slate-900">
        {imageUrl && (
          <div className="w-full h-32 mb-3 rounded-xl overflow-hidden bg-slate-100 relative shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl as string} alt={placeName as string} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <h3 className="font-bold text-base leading-tight mb-1.5">{placeName as React.ReactNode}</h3>
        {category && (
          <div className="flex flex-wrap gap-1 mb-2">
            <span className="bg-primary/10 text-primary text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border border-primary/20">
              {category as React.ReactNode}
            </span>
          </div>
        )}
        {description && <p className="text-xs text-slate-600 font-medium leading-relaxed">{description as React.ReactNode}</p>}
        {notes && <p className="text-xs text-amber-800 bg-amber-100/50 p-2 rounded-lg font-medium italic mt-2 border border-amber-200/50">Note: {notes as React.ReactNode}</p>}
        {(price || rating) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-xs font-bold text-slate-700">
            {price && <span className="text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded-md border border-emerald-200/50">{formatPrice(price)}</span>}
            {price && rating && <span className="opacity-30">•</span>}
            {rating && <span className="flex items-center gap-1 bg-amber-100/50 text-amber-700 px-1.5 py-0.5 rounded-md border border-amber-200/50"><Star size={12} className="fill-amber-500 text-amber-500" /> {rating as React.ReactNode}</span>}
          </div>
        )}
        {googleMapsUri && (
          <a 
            href={googleMapsUri as string} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline text-xs mt-2 inline-block font-medium"
          >
            View on Google Maps
          </a>
        )}
      </div>
    </InfoWindow>
  );
}
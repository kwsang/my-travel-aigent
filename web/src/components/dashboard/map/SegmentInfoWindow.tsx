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
  
  const placeName = (segment.details?.name || 'Unnamed Event') as string;
  const description = segment.details?.description as string | undefined;
  const notes = segment.details?.notes as string | undefined;
  const price = segment.details?.price;
  const rating = segment.details?.rating as number | undefined;
  const category = segment.details?.category as string | undefined;
  const imageUrl = (segment.details?.image_url || segment.image_url || segment.details?.photo_url) as string | undefined;
  const googleMapsUri = (segment.details?.google_maps_uri || segment.google_maps_uri) as string | undefined;
  
  return (
    <InfoWindow position={{ lat: geo.latitude, lng: geo.longitude }} onCloseClick={onClose}>
      <div className="flex flex-col p-2 max-w-[240px] text-slate-900">
        {imageUrl && (
          <div className="w-full h-32 mb-3 rounded-xl overflow-hidden bg-slate-100 relative shadow-inner">
            {/* Skeleton Background */}
            <div className="absolute inset-0 animate-pulse bg-slate-200" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={imageUrl} 
              alt={placeName} 
              className="w-full h-full object-cover relative z-10 transition-opacity duration-300 opacity-0" 
              referrerPolicy="no-referrer"
              onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
          </div>
        )}
        <h3 className="font-bold text-base leading-tight mb-1.5">{placeName}</h3>
        {category && (
          <div className="flex flex-wrap gap-1 mb-2">
            <span className="bg-primary/10 text-primary text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border border-primary/20">
              {category}
            </span>
          </div>
        )}
        {description && <p className="text-xs text-slate-600 font-medium leading-relaxed">{description}</p>}
        {notes && <p className="text-xs text-amber-800 bg-amber-100/50 p-2 rounded-lg font-medium italic mt-2 border border-amber-200/50">Note: {notes}</p>}
        {(price || rating) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-xs font-bold text-slate-700">
            {price && <span className="text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded-md border border-emerald-200/50">{formatPrice(price)}</span>}
            {price && rating && <span className="opacity-30">•</span>}
            {rating && <span className="flex items-center gap-1 bg-amber-100/50 text-amber-700 px-1.5 py-0.5 rounded-md border border-amber-200/50"><Star size={12} className="fill-amber-500 text-amber-500" /> {rating}</span>}
          </div>
        )}
        {googleMapsUri && (
          <a 
            href={googleMapsUri} 
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
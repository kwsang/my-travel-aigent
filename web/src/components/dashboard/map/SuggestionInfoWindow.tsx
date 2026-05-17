import React from 'react';
import { InfoWindow } from '@vis.gl/react-google-maps';
import { Star, Plus, Bed, RefreshCw } from 'lucide-react';
import { useMapContext } from './MapContext';

interface SuggestionInfoWindowProps {
  place: any;
  hasLodging?: boolean;
  onClose: () => void;
}

export default function SuggestionInfoWindow({ place, hasLodging, onClose }: SuggestionInfoWindowProps) {
  const { handleMapAddLodging, handleAddActivity, formatPrice } = useMapContext();
  const geo = place.geo || place.details?.geo || place.location;
  if (!geo) return null;
  
  const placeName = place.details?.name || place.displayName?.text || place.name || 'Suggested Place';
  const description = place.details?.description;
  const notes = place.details?.notes;
  const price = place.details?.price || place.priceLevel || place.price_tier || place.price;
  const rating = place.details?.rating || place.rating;
  const imageUrl = place.details?.image_url || place.image_url || place.photo_url || place.photoUri || (place.photos && place.photos.length > 0 ? place.photos[0].photoUri || place.photos[0].name : null);
  
  const rawTypes = place.types || place.details?.types || [];
  const typesArray = Array.isArray(rawTypes) ? rawTypes : (typeof rawTypes === 'string' ? rawTypes.replace(/['\[\]]/g, '').split(', ') : []);
  const displayTypes = typesArray
    .filter((t: string) => !['point_of_interest', 'establishment', 'food', 'service', 'premise'].includes(t.trim()))
    .slice(0, 2)
    .map((t: string) => t.trim().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
  
  if (displayTypes.length === 0 && place.details?.category) {
    displayTypes.push(place.details.category);
  }

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
        {displayTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {displayTypes.map((type: string, idx: number) => (
              <span key={idx} className="bg-primary/10 text-primary text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm">
                {type as React.ReactNode}
              </span>
            ))}
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
        <button
          className="mt-2 w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-bold py-1.5 px-3 rounded-md hover:bg-primary/90 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (place._suggestionType === 'lodging') {
              handleMapAddLodging(place);
            } else {
              const isDining = place.types?.some((t: string) => ['restaurant', 'cafe', 'food', 'bar', 'bakery'].includes(t));
              handleAddActivity(placeName as string, isDining ? 'dining' : 'activity');
            }
            onClose();
          }}
        >
          {place._suggestionType === 'lodging' ? (
            hasLodging ? <RefreshCw size={14} /> : <Bed size={14} />
          ) : (
            <Plus size={14} />
          )} 
          {place._suggestionType === 'lodging' ? (
            hasLodging ? 'Replace Lodging' : 'Select As Lodging'
          ) : (
            'Add to Itinerary'
          )}
        </button>
      </div>
    </InfoWindow>
  );
}
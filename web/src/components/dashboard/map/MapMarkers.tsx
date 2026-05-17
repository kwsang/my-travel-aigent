import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { Home } from 'lucide-react';
import PopularDestinationMarker from './PopularDestinationMarker';
import SuggestionMarker from './SuggestionMarker';
import TimelineMarker from './AdvancedSegmentMarker';
import { Event } from '@/types';
import { useItineraryData } from '@/context/ItineraryContext';
import { useMapContext } from './MapContext';

interface MapMarkersProps {
  startGeo: { lat: number; lng: number } | null;
  startingLocation?: string;
  destinationInfo: any;
  popularDestinations: any[];
  hoveredPopularIndex: number | null;
  setHoveredPopularIndex: (idx: number | null) => void;
}

export default function MapMarkers({
  startGeo,
  startingLocation,
  destinationInfo,
  popularDestinations,
  hoveredPopularIndex,
  setHoveredPopularIndex,
}: MapMarkersProps) {
  const { segments, itinerary, activeSegmentIndex, setActiveSegmentIndex, hoveredSegmentIndex, setHoveredSegmentIndex } = useItineraryData();
  const { handleSelectDestination, setActiveSuggestion } = useMapContext();

  return (
    <>
      {/* Start Location Marker */}
      {startGeo && (
        <AdvancedMarker
          position={startGeo}
          title={`Starting from ${startingLocation}`}
        >
          <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500">
            <div className="relative bg-slate-700 border-2 border-white shadow-xl rounded-full w-8 h-8 flex items-center justify-center mb-1 group-hover:border-slate-400 group-hover:shadow-slate-500/30 transition-all">
              <Home size={14} className="text-white" />
            </div>
            <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-foreground/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
              Start: {startingLocation as React.ReactNode}
            </div>
          </div>
        </AdvancedMarker>
      )}

      {/* Popular Destinations Markers */}
      {segments.length === 0 && !itinerary.destination && popularDestinations.map((dest, idx) => (
        <PopularDestinationMarker
          key={`popular-${dest.name}-${idx}`}
          dest={dest}
          idx={idx}
          isHovered={hoveredPopularIndex === idx}
          onHover={setHoveredPopularIndex}
          onClick={async () => {
            handleSelectDestination(dest.name);
          }}
        />
      ))}

      {/* Selected Destination Marker */}
      {itinerary.destination && destinationInfo?.location?.coordinates && (
        <AdvancedMarker
          position={{ lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] }}
          title={itinerary.destination}
        >
          <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500 cursor-default">
            <div className="bg-primary/90 border-2 border-white/20 shadow-xl rounded-full w-12 h-12 flex items-center justify-center text-2xl mb-1 transition-colors">
              📍
            </div>
            <div className="bg-background/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold tracking-wider uppercase text-foreground/90 border border-primary/40 whitespace-nowrap pointer-events-none shadow-lg">
              {itinerary.destination}
            </div>
          </div>
        </AdvancedMarker>
      )}

      {/* Suggested Lodgings */}
      {!!itinerary.destination && destinationInfo?.suggested_lodging?.filter((p: any) => p.name !== itinerary.lodging?.name).map((place: any, idx: number) => (
        <SuggestionMarker
          key={`suggestion-acc-${idx}`}
          place={place}
          idx={idx}
          type="lodging"
          onClick={() => {
            setActiveSuggestion({ ...place, _suggestionType: 'lodging' });
            setActiveSegmentIndex(null as any);
          }}
        />
      ))}

      {/* Suggested Activities */}
      {!!itinerary.destination && destinationInfo?.suggested_activities?.map((place: any, idx: number) => (
        <SuggestionMarker
          key={`suggestion-act-${idx}`}
          place={place}
          idx={idx}
          type="activity"
          onClick={() => {
            setActiveSuggestion({ ...place, _suggestionType: 'activity' });
            setActiveSegmentIndex(null as any);
          }}
        />
      ))}

      {/* Timeline Segments */}
      {segments.map((segment: Event, index: number) => {
        if (['TRANSPORT', 'FLIGHT', 'LOGISTICS'].includes(segment.segment)) return null;
        
        return (
          <TimelineMarker
            key={`${segment.day}-${index}`} 
            segment={segment}
            index={index}
            isActive={activeSegmentIndex === index}
            isHovered={hoveredSegmentIndex === index}
            onClick={() => {
              setActiveSegmentIndex(activeSegmentIndex === index ? null : index);
              setActiveSuggestion(null);
            }}
            onMouseEnter={() => setHoveredSegmentIndex?.(index)}
            onMouseLeave={() => setHoveredSegmentIndex?.(null)}
          />
        );
      })}
    </>
  );
}
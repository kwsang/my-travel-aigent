import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';

interface PopularDestinationMarkerProps {
  dest: { name: string; lat: number; lng: number; emoji: string };
  idx: number;
  isHovered: boolean;
  onHover: (idx: number | null) => void;
  onClick: () => void;
}

export default function PopularDestinationMarker({ dest, idx, isHovered, onHover, onClick }: PopularDestinationMarkerProps) {
  return (
    <AdvancedMarker
      position={{ lat: dest.lat, lng: dest.lng }}
      title={dest.name}
      onClick={onClick}
      onMouseEnter={() => onHover(idx)}
      onMouseLeave={() => onHover(null)}
      zIndex={isHovered ? 100 : 1}
    >
      <div className="flex flex-col items-center group transition-transform hover:scale-110 animate-in fade-in zoom-in duration-500 cursor-pointer">
        <div className="bg-card border border-white/20 shadow-xl rounded-full w-10 h-10 flex items-center justify-center text-xl mb-1 group-hover:border-primary group-hover:shadow-primary/20 transition-colors">
          {dest.emoji}
        </div>
        <div className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-foreground/80 border border-white/10 whitespace-nowrap pointer-events-none shadow-lg">
          {dest.name}
        </div>
      </div>
    </AdvancedMarker>
  );
}
'use client';

import React, { memo } from 'react';
import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { Car, Utensils, Sparkles, Bed, ClipboardList, Plane, LucideIcon } from 'lucide-react';

// Map segment types to Lucide icons
const SegmentIcons: Record<string, LucideIcon> = {
  TRANSPORT: Car,
  DINING: Utensils,
  EXPERIENCE: Sparkles,
  ACCOMMODATION: Bed,
  LOGISTICS: ClipboardList,
  FLIGHT: Plane,
};

// Updated map segment colors matching the new theme
const SegmentColors: Record<string, { bg: string }> = {
  ACCOMMODATION: { bg: '#ffd07b' }, // Jasmine
  DINING: { bg: '#b1740f' }, // Copperwood
  EXPERIENCE: { bg: '#fdb833' }, // Sunflower Gold
  FLIGHT: { bg: '#296eb4' }, // Bright Marine
  TRANSPORT: { bg: '#1789fc' }, // Blue Energy
  LOGISTICS: { bg: '#b1740f' }, // Copperwood
};

interface AdvancedSegmentMarkerProps {
  position: { lat: number; lng: number };
  title?: string;
  segmentType: string;
  isActive: boolean;
  index: number;
  onClick: (index: number) => void;
}

const AdvancedSegmentMarker = memo(function AdvancedSegmentMarker({
  position,
  title,
  segmentType,
  isActive,
  index,
  onClick
}: AdvancedSegmentMarkerProps) {
  const Icon = SegmentIcons[segmentType] || Sparkles;
  const colors = SegmentColors[segmentType] || { bg: '#6366f1' };

  return (
    <AdvancedMarker
      position={position}
      title={title}
      onClick={() => onClick(index)}
      zIndex={isActive ? 100 : 1}
    >
      <Pin 
        background={colors.bg} 
        borderColor={isActive ? '#020617' : '#ffffff'}
        scale={isActive ? 1.4 : 1.1}
      >
        <Icon 
          size={isActive ? 16 : 14} 
          style={{ color: '#ffffff' }} 
        />
      </Pin>
    </AdvancedMarker>
  );
});

export default AdvancedSegmentMarker;

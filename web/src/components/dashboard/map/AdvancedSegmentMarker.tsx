'use client';

import React, { memo } from 'react';
import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { Sparkles } from 'lucide-react';
import { SegmentType, SegmentIcons, SegmentColors } from '@/components/dashboard/utils/segmentMapping';

interface AdvancedSegmentMarkerProps {
  position: { lat: number; lng: number };
  title?: string;
  segmentType: SegmentType;
  isActive: boolean;
  index: number;
  onClick: (index: number) => void;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const AdvancedSegmentMarker = memo(function AdvancedSegmentMarker({
  position,
  title,
  segmentType,
  isActive,
  index,
  onClick,
  isHovered,
  onMouseEnter,
  onMouseLeave
}: AdvancedSegmentMarkerProps) {
  const Icon = SegmentIcons[segmentType] || Sparkles;
  const colors = SegmentColors[segmentType] || { bg: '#6366f1' };

  return (
    <AdvancedMarker
      position={position}
      title={title}
      onClick={() => onClick(index)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      zIndex={isActive ? 100 : (isHovered ? 50 : 1)}
    >
      <Pin 
        background={colors.bg} 
        borderColor={isActive ? '#020617' : (isHovered ? '#6366f1' : '#ffffff')}
        scale={isActive ? 1.4 : (isHovered ? 1.25 : 1.1)}
      >
        <Icon 
          size={isActive ? 16 : (isHovered ? 15 : 14)} 
          style={{ color: '#ffffff' }} 
        />
      </Pin>
    </AdvancedMarker>
  );
});

export default AdvancedSegmentMarker;

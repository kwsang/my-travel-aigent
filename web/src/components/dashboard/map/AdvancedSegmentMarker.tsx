'use client';

import React from 'react';
import { useGoogleMap } from '@react-google-maps/api';

interface AdvancedSegmentMarkerProps {
  position: google.maps.LatLngLiteral;
  title: string;
  segmentType: string;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Custom Advanced Marker Component
 * Leverages google.maps.marker.AdvancedMarkerElement and PinElement
 */
export default function AdvancedSegmentMarker({ position, title, segmentType, isActive, onClick }: AdvancedSegmentMarkerProps) {
  const map = useGoogleMap();

  React.useEffect(() => {
    if (!map || !window.google) return;

    let bgColor = '#6366f1'; // Default primary
    let glyph = '📍';
    
    switch(segmentType) {
      case 'ACCOMMODATION': bgColor = '#8b5cf6'; glyph = '🏨'; break; // Violet
      case 'DINING': bgColor = '#f43f5e'; glyph = '🍽️'; break; // Rose
      case 'EXPERIENCE': bgColor = '#f59e0b'; glyph = '✨'; break; // Amber
      case 'FLIGHT': bgColor = '#0ea5e9'; glyph = '✈️'; break; // Sky
      case 'TRANSPORT': bgColor = '#0ea5e9'; glyph = '🚗'; break; // Sky
      case 'LOGISTICS': bgColor = '#64748b'; glyph = '📋'; break; // Slate
    }

    const pin = new google.maps.marker.PinElement({
      background: bgColor,
      borderColor: isActive ? '#020617' : '#ffffff', // High contrast dark border when active
      glyph: glyph,
      scale: isActive ? 1.4 : 1.1, // Scale up when active
    });

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map, position, title, content: pin.element,
      zIndex: isActive ? 100 : undefined, // Bring to front
    });

    // AdvancedMarkerElements use 'gmp-click' instead of standard 'click'
    const listener = marker.addListener('gmp-click', onClick);

    return () => {
      listener.remove();
      marker.map = null;
    };
  }, [map, position, title, segmentType, isActive, onClick]);

  return null;
}

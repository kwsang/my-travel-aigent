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

  // Stable callback ref to avoid effect re-runs when onClick changes reference
  const onClickRef = React.useRef(onClick);
  React.useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  React.useEffect(() => {
    if (!map || !window.google) return;

    let bgColor = '#6366f1'; // Default primary
    let iconUrl = ''; // Define custom image URLs for the markers
    let fallbackGlyph = '📍';
    
    switch(segmentType) {
      case 'ACCOMMODATION': bgColor = '#8b5cf6'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/lodging-71.png'; break;
      case 'DINING': bgColor = '#f43f5e'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/restaurant-71.png'; break;
      case 'EXPERIENCE': bgColor = '#f59e0b'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/museum-71.png'; break;
      case 'FLIGHT': bgColor = '#0ea5e9'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/airport-71.png'; break;
      case 'TRANSPORT': bgColor = '#0ea5e9'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/bus_share_taxi_pinlet.png'; break;
      case 'LOGISTICS': bgColor = '#64748b'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/generic_business-71.png'; break;
    }

    // We cast to 'any' to bypass TS errors in case @types/google.maps is outdated
    const pinOptions: any = {
      background: bgColor,
      borderColor: isActive ? '#020617' : '#ffffff', // High contrast dark border when active
      scale: isActive ? 1.4 : 1.1, // Scale up when active
    };

    if (iconUrl) {
      pinOptions.glyphSrc = iconUrl;
    } else {
      pinOptions.glyphText = fallbackGlyph;
    }

    const pin = new google.maps.marker.PinElement(pinOptions);

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      title,
      content: pin,
      zIndex: isActive ? 100 : undefined, // Bring to front
    });

    // AdvancedMarkerElements use 'gmp-click' instead of standard 'click'
    const listener = marker.addListener('gmp-click', () => {
      if (onClickRef.current) onClickRef.current();
    });

    return () => {
      listener.remove();
      marker.map = null;
    };
  }, [map, position.lat, position.lng, title, segmentType, isActive]);

  return null;
}

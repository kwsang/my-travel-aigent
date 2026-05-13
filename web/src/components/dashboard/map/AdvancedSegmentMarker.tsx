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
    let iconUrl = ''; // Define custom image URLs for the markers
    let fallbackGlyph = '📍';
    
    switch(segmentType) {
      case 'ACCOMMODATION': bgColor = '#8b5cf6'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/lodging-71.png'; break;
      case 'DINING': bgColor = '#f43f5e'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/restaurant-71.png'; break;
      case 'EXPERIENCE': bgColor = '#f59e0b'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/museum-71.png'; break;
      case 'FLIGHT': bgColor = '#0ea5e9'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/airport-71.png'; break;
      case 'TRANSPORT': bgColor = '#0ea5e9'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/taxi-71.png'; break;
      case 'LOGISTICS': bgColor = '#64748b'; iconUrl = 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/generic_business-71.png'; break;
    }

    // Create a custom HTML image element for the glyph
    let glyphContent: HTMLElement | string = fallbackGlyph;
    if (iconUrl) {
      const img = document.createElement('img');
      img.src = iconUrl;
      // Style the image to fit beautifully inside the PinElement
      img.style.width = '18px';
      img.style.height = '18px';
      img.style.objectFit = 'contain';
      glyphContent = img;
    }

    const pin = new google.maps.marker.PinElement({
      background: bgColor,
      borderColor: isActive ? '#020617' : '#ffffff', // High contrast dark border when active
      glyph: glyphContent,
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

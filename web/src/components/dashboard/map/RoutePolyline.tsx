'use client';

import React, { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

// Custom Polyline wrapper since @vis.gl/react-google-maps doesn't provide a <Polyline> natively
export default function RoutePolyline({ path, options }: { path: { lat: number; lng: number }[], options: any }) {
  const map = useMap();
  const polylineRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;
    if (!polylineRef.current) {
      polylineRef.current = new (window as any).google.maps.Polyline({ ...options, path });
      polylineRef.current.setMap(map);
    } else {
      polylineRef.current.setOptions(options);
      polylineRef.current.setPath(path);
    }
  }, [map, path, options]);

  useEffect(() => {
    return () => {
      if (polylineRef.current) polylineRef.current.setMap(null);
    };
  }, []);

  return null;
}
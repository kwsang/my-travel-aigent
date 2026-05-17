import { useEffect, useRef } from 'react';
import { Event } from '@/types';

export function useMapBounds(
  map: any,
  isLoaded: boolean,
  activeSegmentIndex: number | null,
  geoSignature: string,
  segments: Event[],
  itinerary: any,
  destinationInfo: any,
  popularDestinations: any[],
  startGeo: { lat: number; lng: number } | null
) {
  const prevGeoSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const isGeoSignatureChanged = prevGeoSignatureRef.current !== geoSignature;
    prevGeoSignatureRef.current = geoSignature;

    if (activeSegmentIndex !== null && segments[activeSegmentIndex]) {
      const activeSegment = segments[activeSegmentIndex];
      const isTransport = ['FLIGHT', 'TRANSPORT'].includes(activeSegment.segment);

      let prevGeo: { latitude: number; longitude: number } | null | undefined = null;
      let nextGeo = activeSegment.geo || activeSegment.details?.geo;

      if (isTransport) {
        // Try to find the previous location
        for (let i = activeSegmentIndex - 1; i >= 0; i--) {
          const s = segments[i];
          const geo = s.geo || s.details?.geo;
          if (geo) {
            prevGeo = geo;
            break;
          }
        }
        if (!prevGeo && startGeo) {
          prevGeo = { latitude: startGeo.lat, longitude: startGeo.lng };
        }
        // If the transport segment itself doesn't have a geo, find the next one
        if (!nextGeo) {
          for (let i = activeSegmentIndex + 1; i < segments.length; i++) {
            const s = segments[i];
            const geo = s.geo || s.details?.geo;
            if (geo) {
              nextGeo = geo;
              break;
            }
          }
        }
      }

      if (isTransport && prevGeo && nextGeo) {
        const bounds = new (window as any).google.maps.LatLngBounds();
        bounds.extend({ lat: prevGeo!.latitude, lng: prevGeo!.longitude });
        bounds.extend({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        
        const details = activeSegment.details as any;
        if (details?.polyline && (window as any).google?.maps?.geometry?.encoding) {
          try {
            const decoded = (window as any).google.maps.geometry.encoding.decodePath(details.polyline);
            decoded.forEach((p: any) => bounds.extend(p));
          } catch(e) {}
        }
        
        map.panToBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 });
      } else if (nextGeo) {
        map.panTo({ lat: nextGeo!.latitude, lng: nextGeo!.longitude });
        map.setZoom(15);
      }
    } else if (isGeoSignatureChanged) {
      if (segments.length > 0 || itinerary.lodging || (!itinerary.lodging && destinationInfo?.suggested_lodging?.length) || destinationInfo?.suggested_activities?.length || (itinerary.destination && destinationInfo?.location?.coordinates)) {
        // Zoom to fit all segments and suggestions if no active segment is selected
        const bounds = new (window as any).google.maps.LatLngBounds();
        let pointCount = 0;
        let lastPoint: { lat: number; lng: number } | null = null;
  
        segments.forEach((segment: Event) => {
          if (['FLIGHT', 'TRANSPORT', 'LOGISTICS'].includes(segment.segment)) return; // Exclude transit and logistics segments from general overview bounds
          const geo = segment.geo || segment.details?.geo;
          if (geo) {
            const pos = { lat: geo.latitude, lng: geo.longitude };
            bounds.extend(pos);
            pointCount++;
            lastPoint = pos;
          }
        });
  
        if (itinerary.lodging) {
          const geo = itinerary.lodging.geo || itinerary.lodging.details?.geo || itinerary.lodging.location;
          if (geo) {
            const pos = { lat: geo.latitude, lng: geo.longitude };
            bounds.extend(pos);
            pointCount++;
            lastPoint = pos;
          }
        }
  
        if (!itinerary.lodging) {
          destinationInfo?.suggested_lodging?.forEach((place: any) => {
            const geo = place.geo || place.details?.geo || place.location;
            if (geo) {
              const pos = { lat: geo.latitude, lng: geo.longitude };
              bounds.extend(pos);
              pointCount++;
              lastPoint = pos;
            }
          });
        }
  
        destinationInfo?.suggested_activities?.forEach((place: any) => {
          const geo = place.geo || place.details?.geo || place.location;
          if (geo) {
            const pos = { lat: geo.latitude, lng: geo.longitude };
            bounds.extend(pos);
            pointCount++;
            lastPoint = pos;
          }
        });
  
        if (itinerary.destination && destinationInfo?.location?.coordinates) {
          const pos = { lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] };
          bounds.extend(pos);
          pointCount++;
          lastPoint = pos;
        }
  
        if (pointCount === 1 && lastPoint) {
          map.panTo(lastPoint);
          map.setZoom(14); // Sensible default zoom for a single marker
        } else if (pointCount > 1) {
          map.fitBounds(bounds, { top: 100, bottom: 50, left: 50, right: 420 }); 
        }
      } else if (segments.length === 0 && !itinerary.lodging) {
        const dest = popularDestinations.find(d => d.name === itinerary.destination);
        if (dest) {
          map.panTo({ lat: dest.lat, lng: dest.lng });
          map.setZoom(11);
        } else {
          map.setZoom(4);
          map.panTo({ lat: 39.8283, lng: -98.5795 });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, activeSegmentIndex, geoSignature]);
}
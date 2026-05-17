import { useMemo } from 'react';
import { Event } from '@/types';

export function useRouteEdges(
  segments: Event[],
  activeSegmentIndex: number | null,
  startGeo: { lat: number; lng: number } | null,
  itinerary: any,
  destinationInfo: any
) {
  return useMemo(() => {
    const edges: { path: { lat: number; lng: number }[]; options: any }[] = [];
    
    // A palette of distinct, vibrant colors for overlapping routes
    const routePalette = [
      '#1789fc', // Primary Blue
      '#fdb833', // Accent Gold
      '#10b981', // Emerald
      '#ec4899', // Pink
      '#8b5cf6', // Violet
      '#f43f5e', // Rose
      '#06b6d4', // Cyan
      '#eab308'  // Yellow
    ];

    const getOptions = (segment: Event, edgeIndex: number, segmentIndex: number) => {
      const details = segment.details as typeof segment.details & { travel_mode?: string };
      const mode = details?.travel_mode || (segment.segment === 'FLIGHT' ? 'FLIGHT' : 'DRIVE');
      
      const hasActive = activeSegmentIndex !== null;
      const isActive = activeSegmentIndex === segmentIndex;

      let strokeOpacity = 0.8;
      let strokeWeight = 4;
      let icons = undefined;

      if (segment.segment === 'FLIGHT' || mode === 'FLIGHT') {
        strokeOpacity = 0;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeColor: routePalette[edgeIndex % routePalette.length], strokeOpacity: hasActive ? (isActive ? 1.0 : 0.15) : 0.9, scale: 3 }, offset: '0', repeat: '15px' }];
      } else if (mode === 'WALK' || mode === 'BICYCLE') {
        strokeOpacity = 0;
        strokeWeight = 3;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeColor: routePalette[edgeIndex % routePalette.length], strokeOpacity: hasActive ? (isActive ? 1.0 : 0.15) : 0.8, scale: 2 }, offset: '0', repeat: '10px' }];
      } else if (mode === 'TRANSIT') {
        strokeOpacity = 0;
        strokeWeight = 5;
        icons = [{ icon: { path: 'M 0,-1 0,1', strokeColor: routePalette[edgeIndex % routePalette.length], strokeOpacity: hasActive ? (isActive ? 1.0 : 0.15) : 0.8, scale: 4 }, offset: '0', repeat: '20px' }];
      } else {
        strokeOpacity = hasActive ? (isActive ? 1.0 : 0.15) : 0.8;
        strokeWeight = hasActive && isActive ? 6 : 4;
      }

      return {
        strokeColor: routePalette[edgeIndex % routePalette.length],
        strokeOpacity,
        strokeWeight,
        geodesic: true,
        icons,
        zIndex: isActive ? 100 : 1
      };
    };

    let lastValidGeo: { lat: number; lng: number } | null = null;
    let edgeCounter = 0;

    segments.forEach((curr, index) => {
      const currDetails = curr.details as typeof curr.details & { polyline?: string };
      const currGeo = curr.geo || curr.details?.geo;
      
      let path: { lat: number; lng: number }[] = [];

      if (curr.segment === 'TRANSPORT' || curr.segment === 'FLIGHT') {
        if (curr.segment === 'FLIGHT') {
          const originPos = lastValidGeo || startGeo;
          if (originPos) {
            let nextPos: { lat: number; lng: number } | null = null;
            
            if (currGeo) {
              nextPos = { lat: currGeo.latitude, lng: currGeo.longitude };
            } else {
              for (let i = index + 1; i < segments.length; i++) {
                const nextSeg = segments[i];
                const nDetails = nextSeg.details as any;
                
                if (nDetails?.polyline && (window as any).google?.maps?.geometry?.encoding) {
                  try {
                    const decoded = (window as any).google.maps.geometry.encoding.decodePath(nDetails.polyline);
                    if (decoded.length > 0) {
                      nextPos = { lat: decoded[0].lat(), lng: decoded[0].lng() };
                      break;
                    }
                  } catch (e) {}
                }
                
                const nGeo = nextSeg.geo || nextSeg.details?.geo;
                if (nGeo) {
                  nextPos = { lat: nGeo.latitude, lng: nGeo.longitude };
                  break;
                }
              }
              
              if (!nextPos && itinerary.lodging && index < segments.length / 2) {
                const accGeo = itinerary.lodging.geo || itinerary.lodging.details?.geo || itinerary.lodging.location;
                if (accGeo) {
                  nextPos = { lat: accGeo.latitude, lng: accGeo.longitude };
                } else if (destinationInfo?.location?.coordinates) {
                  nextPos = { lat: destinationInfo.location.coordinates[1], lng: destinationInfo.location.coordinates[0] };
                }
              } else if (!nextPos && startGeo) {
                nextPos = startGeo;
              }
            }
            
            if (nextPos) {
              path = [originPos, nextPos];
            }
          }
        } else if (currDetails?.polyline && (window as any).google?.maps?.geometry?.encoding) {
          try {
            const decoded = (window as any).google.maps.geometry.encoding.decodePath(currDetails.polyline);
            path = decoded.map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
          } catch (e) {}
        } else if (lastValidGeo && currGeo) {
          path = [
            lastValidGeo,
            { lat: currGeo.latitude, lng: currGeo.longitude }
          ];
        }
      }

      if (path.length > 0) {
        edges.push({
          path: path,
          options: getOptions(curr, edgeCounter++, index)
        });
      }
      if (currGeo) {
        lastValidGeo = { lat: currGeo.latitude, lng: currGeo.longitude };
      } else if (path.length > 0) {
        lastValidGeo = path[path.length - 1];
      }
    });
    
    return edges;
  }, [segments, activeSegmentIndex, startGeo, itinerary?.lodging, destinationInfo?.location?.coordinates]);
}
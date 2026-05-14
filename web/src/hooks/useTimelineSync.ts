import { useState, useRef, useEffect, useCallback } from 'react';
import { API_CONFIG } from '@/config/constants';
import { Event } from '@/types';

export function useTimelineSync(sessionId: string, userId: string, setItinerary: (data: any) => void) {
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup the sync timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  const syncItinerary = useCallback((newSegments: Event[]) => {
    setIsSyncing(true);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Debounce the backend API call by 1.5 seconds
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}?user_id=${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: newSegments }),
        });

        if (response.ok) {
          const updatedItinerary = await response.json();
          // Re-sync with the server's response to get validation results back
          setItinerary(updatedItinerary);
        } else {
          console.error("Failed to sync reordered itinerary.");
        }
      } catch (error) {
        console.error("Error syncing itinerary:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 1500);
  }, [sessionId, userId, setItinerary]);

  return { isSyncing, syncItinerary };
}
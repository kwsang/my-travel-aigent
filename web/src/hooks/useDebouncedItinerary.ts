import { useState, useEffect, useCallback, useRef } from 'react';
import { ItineraryModel, EventModel } from '../types';

/**
 * Custom hook to handle debounced updates to the travel itinerary.
 * Provides on-the-fly validation and auto-saving to the FastAPI backend.
 */
export function useDebouncedItinerary(initialData: ItineraryModel, delay: number = 800) {
  const [itinerary, setItinerary] = useState<ItineraryModel>(initialData);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Function to perform the actual API call
  const persistUpdate = useCallback(async (updatedEvents: EventModel[]) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUpdating(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/itinerary/${itinerary.session_id}`, {
        method: 'PATCH',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          // If you implemented the Auth logic from server.py, add your token here:
          // 'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ events: updatedEvents }),
      });

      if (!response.ok) throw new Error('Failed to update itinerary');

      const serverResult: ItineraryModel = await response.json();
      
      // Update local state with server-side validation results (is_conflict, errors)
      setItinerary(serverResult);
      setLastSaved(new Date());
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error("Itinerary Sync Error:", error);
    } finally {
      // Only set loading to false if this specific request wasn't aborted
      if (controller.signal.aborted) return;
      setIsUpdating(false);
    }
  }, [itinerary.session_id]);

  // Debounce logic
  useEffect(() => {
    // Don't trigger on initial mount if data matches
    if (JSON.stringify(itinerary.events) === JSON.stringify(initialData.events)) {
      return;
    }

    const handler = setTimeout(() => {
      persistUpdate(itinerary.events);
    }, delay);

    return () => {
      clearTimeout(handler);
      // Cancel the pending request if the user starts moving things again
      abortControllerRef.current?.abort();
    };
  }, [itinerary.events, delay, persistUpdate]);

  /**
   * Use this function in your UI components (Gantt/Timeline) to 
   * update specific event details or positions.
   */
  const updateEvents = (newEvents: EventModel[]) => {
    setItinerary(prev => ({
      ...prev,
      events: newEvents
    }));
  };

  return {
    itinerary,
    updateEvents,
    isUpdating,
    lastSaved,
    // Expose helpers for the UI to show warnings
    hasConflicts: itinerary.is_conflict,
    errors: itinerary.validation_errors
  };
}
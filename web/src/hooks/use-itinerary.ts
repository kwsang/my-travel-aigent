import { useState, useEffect } from 'react';
import { Itinerary } from '@/types';

export function useItinerary(sessionId: string | null) {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);

  useEffect(() => {
    // Don't poll if we don't have a session ID yet
    if (!sessionId) return;

    const fetchItinerary = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';
        
        // We include the user_id query param to match the hardcoded identity in use-chat.ts
        // This ensures the polling fetches the data saved by the agent for this specific user.
        const url = `${baseUrl}/itinerary/${sessionId}?user_id=user_savannah_test`;
        
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          setItinerary(data);
        } else if (response.status !== 404) {
          // Log other errors, but ignore 404s (itinerary not created yet)
          console.error("Failed to fetch itinerary:", response.statusText);
        }
      } catch (err) {
        console.error("Itinerary polling error:", err);
      }
    };

    // Initial fetch and interval setup
    fetchItinerary();
    const intervalId = setInterval(fetchItinerary, 5000);

    return () => clearInterval(intervalId);
  }, [sessionId]);

  return { itinerary };
}
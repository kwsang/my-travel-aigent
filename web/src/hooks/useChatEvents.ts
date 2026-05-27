import { useEffect, useRef } from 'react';

export function useChatEvents(
  sendMessage: (userMessage: string, overrideItinerary?: any, overrideProfile?: any, displayMessage?: string) => void,
  isLoading: boolean,
  itinerary: any
) {
  const profileUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to the latest itinerary to avoid re-binding window event listeners on every state change
  const itineraryRef = useRef(itinerary);
  useEffect(() => {
    itineraryRef.current = itinerary;
  }, [itinerary]);

  // Listen for manual timeline drag and drop events
  useEffect(() => {
    const handleTimelineDragDrop = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const { item, originalDay, targetDay, updatedSegments } = customEvent.detail;
      
      if (item) {
        const itemName = item.details?.name || item.segment || 'an event';
        
        let actionText = `from Day ${originalDay} to Day ${targetDay}`;
        if (originalDay === targetDay) {
          actionText = `to a new time on Day ${targetDay}`;
        }

        sendMessage(
          `I manually dragged and dropped ${itemName} ${actionText}. Please review the updated timeline for any conflicts, adjust the schedule to fit, and verify the budget.`,
          { events: updatedSegments },
          undefined,
          `I moved ${itemName} ${actionText}.`
        );
      }
    };

    window.addEventListener('travel_aigent_timeline_drag_drop', handleTimelineDragDrop);
    return () => window.removeEventListener('travel_aigent_timeline_drag_drop', handleTimelineDragDrop);
  }, [sendMessage]);

  // Listen for custom destination events from the map
  useEffect(() => {
    const handleSetDestination = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const destination = customEvent.detail;
      
      if (destination) {
        const isDefaultName = !itineraryRef.current.trip_name || itineraryRef.current.trip_name === 'New Trip';

        sendMessage(
          `I've selected ${destination} as my destination. Please communicate with the architect to determine travel and lodging based on my traveler profile.`, 
          { destination, ...(isDefaultName ? { trip_name: `${destination} Trip` } : {}) },
          undefined,
          `I've selected ${destination}. Can you determine travel and lodging?`
        );
      }
    };

    window.addEventListener('travel_aigent_set_destination', handleSetDestination);
    return () => window.removeEventListener('travel_aigent_set_destination', handleSetDestination);
  }, [sendMessage]);

  // Listen for custom lodging events from the map
  useEffect(() => {
    const handleSetLodging = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const lodging = customEvent.detail;
      
      if (lodging) {
        const isReplacement = !!itineraryRef.current.lodging;

        const hiddenMessage = isReplacement 
          ? `I have changed my lodging to ${lodging.name}. Please communicate with the architect to update any travel logistics and rearrange my daily experiences based on this new location. You MUST also use the save_destination_lodging tool to permanently save this lodging to the destination's atlas so it is cached for the future.`
          : `I've selected ${lodging.name} as my lodging. Please communicate with the architect to schedule transit to the lodging and check-in/out events, and schedule daily experiences and dining for my trip based on my traveler profile. You MUST also use the save_destination_lodging tool to permanently save this lodging to the destination's atlas so it is cached for the future.`;

        const displayMessage = isReplacement
          ? `I've changed my lodging to ${lodging.name}. Can you update my trip?`
          : `I've selected ${lodging.name} as my lodging. Can you plan the rest of the trip?`;

        sendMessage(hiddenMessage, { lodging }, undefined, displayMessage);
      }
    };

    window.addEventListener('travel_aigent_set_lodging', handleSetLodging);
    return () => window.removeEventListener('travel_aigent_set_lodging', handleSetLodging);
  }, [sendMessage]);

  // Listen for custom add activity events from the map
  useEffect(() => {
    const handleAddActivity = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const { placeName, eventCategory } = customEvent.detail;
      
      if (placeName) {
        sendMessage(
          `I found a great ${eventCategory} option on the map called "${placeName}". Please add it to my itinerary at the most appropriate time and day based on my schedule. You MUST also use the save_destination_activities tool to permanently save this venue to the destination's atlas so it is cached for the future.`, 
          undefined,
          undefined,
          `Please add ${placeName} to my itinerary.`
        );
      }
    };

    window.addEventListener('travel_aigent_add_activity', handleAddActivity);
    return () => window.removeEventListener('travel_aigent_add_activity', handleAddActivity);
  }, [sendMessage]);

  // Listen for targeted profile update events from the profile modal
  useEffect(() => {
    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const { updatedProfile, targetAgent, changeDesc } = customEvent.detail;
      
      if (updatedProfile && targetAgent) {
        if (profileUpdateTimerRef.current) {
          clearTimeout(profileUpdateTimerRef.current);
        }
        
        profileUpdateTimerRef.current = setTimeout(() => {
          const formattedAgent = targetAgent.toLowerCase().replace(/\s+/g, '_');
          sendMessage(
            `I've updated my ${changeDesc} in my traveler profile. Please communicate directly with the ${formattedAgent} to review and adjust the itinerary if needed.`, 
            { budget: updatedProfile.budget || itineraryRef.current.budget },
            updatedProfile,
            `I've updated my ${changeDesc}. Please review the itinerary.`
          );
        }, 3000); // 3-second debounce window
      }
    };

    window.addEventListener('travel_aigent_profile_updated', handleProfileUpdated);
    return () => {
      window.removeEventListener('travel_aigent_profile_updated', handleProfileUpdated);
      if (profileUpdateTimerRef.current) {
        clearTimeout(profileUpdateTimerRef.current);
      }
    };
  }, [sendMessage]);
}
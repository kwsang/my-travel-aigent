import { useEffect, useRef } from 'react';

export function useChatEvents(
  sendMessage: (userMessage: string, overrideItinerary?: any, overrideProfile?: any, displayMessage?: string) => void,
  isLoading: boolean,
  itinerary: any
) {
  const profileUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for manual timeline drag and drop events
  useEffect(() => {
    const handleTimelineDragDrop = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const { item, originalDay, targetDay, updatedSegments } = customEvent.detail;
      
      if (!isLoading && item) {
        const itemName = item.details?.name || item.segment || 'an event';
        const updatedItinerary = { ...itinerary, events: updatedSegments };
        
        let actionText = `from Day ${originalDay} to Day ${targetDay}`;
        if (originalDay === targetDay) {
          actionText = `to a new time on Day ${targetDay}`;
        }

        sendMessage(
          `I manually dragged and dropped ${itemName} ${actionText}. Please review the updated timeline for any conflicts, adjust the schedule to fit, and verify the budget.`,
          updatedItinerary,
          undefined,
          `I moved ${itemName} ${actionText}.`
        );
      }
    };

    window.addEventListener('travel_aigent_timeline_drag_drop', handleTimelineDragDrop);
    return () => window.removeEventListener('travel_aigent_timeline_drag_drop', handleTimelineDragDrop);
  }, [sendMessage, isLoading, itinerary]);

  // Listen for custom destination events from the map
  useEffect(() => {
    const handleSetDestination = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const destination = customEvent.detail;
      
      if (destination && !isLoading) {
        const isDefaultName = !itinerary.trip_name || itinerary.trip_name === 'New Trip';
        const updatedItinerary = { 
          ...itinerary, 
          destination,
          ...(isDefaultName ? { trip_name: `${destination} Trip` } : {})
        };

        sendMessage(
          `I've selected ${destination} as my destination. Please communicate with the travel_pioneer to determine travel and lodging based on my traveler profile.`, 
          updatedItinerary,
          undefined,
          `I've selected ${destination}. Can you determine travel and lodging?`
        );
      }
    };

    window.addEventListener('travel_aigent_set_destination', handleSetDestination);
    return () => window.removeEventListener('travel_aigent_set_destination', handleSetDestination);
  }, [sendMessage, isLoading, itinerary]);

  // Listen for custom lodging events from the map
  useEffect(() => {
    const handleSetLodging = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const lodging = customEvent.detail;
      
      if (lodging && !isLoading) {
        const isReplacement = !!itinerary.lodging;
        const updatedItinerary = { 
          ...itinerary, 
          lodging
        };

        const hiddenMessage = isReplacement 
          ? `I have changed my lodging to ${lodging.name}. Please communicate with the travel_pioneer to update any travel logistics and the activity_planner to rearrange my daily experiences based on this new location.`
          : `I've selected ${lodging.name} as my lodging. Please communicate with the travel_pioneer to schedule my flights and transit, and the activity_planner to schedule daily experiences and dining for my trip based on my traveler profile.`;

        const displayMessage = isReplacement
          ? `I've changed my lodging to ${lodging.name}. Can you update my trip?`
          : `I've selected ${lodging.name} as my lodging. Can you plan the rest of the trip?`;

        sendMessage(hiddenMessage, updatedItinerary, undefined, displayMessage);
      }
    };

    window.addEventListener('travel_aigent_set_lodging', handleSetLodging);
    return () => window.removeEventListener('travel_aigent_set_lodging', handleSetLodging);
  }, [sendMessage, isLoading, itinerary]);

  // Listen for custom add activity events from the map
  useEffect(() => {
    const handleAddActivity = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const { placeName, eventCategory } = customEvent.detail;
      
      if (placeName && !isLoading) {
        sendMessage(
          `I found a great ${eventCategory} option on the map called "${placeName}". Please add it to my itinerary at the most appropriate time and day based on my schedule.`, 
          itinerary,
          undefined,
          `Please add ${placeName} to my itinerary.`
        );
      }
    };

    window.addEventListener('travel_aigent_add_activity', handleAddActivity);
    return () => window.removeEventListener('travel_aigent_add_activity', handleAddActivity);
  }, [sendMessage, isLoading, itinerary]);

  // Listen for targeted profile update events from the profile modal
  useEffect(() => {
    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const { updatedProfile, targetAgent, changeDesc } = customEvent.detail;
      
      if (updatedProfile && targetAgent && !isLoading) {
        if (profileUpdateTimerRef.current) {
          clearTimeout(profileUpdateTimerRef.current);
        }
        
        profileUpdateTimerRef.current = setTimeout(() => {
          const updatedItinerary = {
            ...itinerary,
            budget: updatedProfile.budget || itinerary.budget
          };
          sendMessage(
            `I've updated my ${changeDesc} in my traveler profile. Please communicate directly with the ${targetAgent} to review and adjust the itinerary if needed.`, 
            updatedItinerary,
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
  }, [sendMessage, isLoading, itinerary]);
}
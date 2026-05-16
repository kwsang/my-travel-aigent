import { useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '@/config/constants';
import { Itinerary, TravelerProfile } from '@/types';

export function useDashboardData(visitorId: string | undefined, currentSessionId: string | undefined) {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [itinerary, setItinerary] = useState<Partial<Itinerary>>({
    events: [],
    is_conflict: false,
    validation_errors: [],
  });
  const [isLoadingItinerary, setIsLoadingItinerary] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

  const triggerToast = useCallback((message: string) => {
    setToast({ show: true, message });
  }, []);

  const fetchList = useCallback(async () => {
    if (!visitorId) return;
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary?user_id=${visitorId}`);
      if (response.ok) {
        setItineraries(await response.json());
      } else {
        setToast({ show: true, message: 'Failed to load trip history from server.' });
      }
    } catch (e) {
      console.error("Could not fetch trip list.", e);
      setToast({ show: true, message: 'Network error: Failed to load trip history.' });
    }
  }, [visitorId]);

  const fetchProfile = useCallback(async () => {
    if (!visitorId) return;
    setIsLoadingProfile(true);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/profile/${visitorId}`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else if (response.status !== 404) {
        setToast({ show: true, message: 'Failed to load traveler profile.' });
      }
    } catch (e) {
      console.error("Could not fetch user profile.", e);
      setToast({ show: true, message: 'Network error: Failed to load traveler profile.' });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [visitorId]);

  const fetchItinerary = useCallback(async () => {
    if (!currentSessionId || !visitorId) return;
    setIsLoadingItinerary(true);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${currentSessionId}?user_id=${visitorId}`);
      if (response.ok) {
        const data = await response.json();
        setItinerary(data);
      } else if (response.status !== 404) {
        setToast({ show: true, message: 'Failed to load trip details from server.' });
      }
    } catch (error) {
      console.error("Dashboard Sync: Failed to fetch itinerary.", error);
      setToast({ show: true, message: 'Network error: Failed to load trip details.' });
    } finally {
      setIsLoadingItinerary(false);
    }
  }, [currentSessionId, visitorId]);

  const refreshDashboard = useCallback(() => {
    fetchProfile();
    fetchItinerary();
    fetchList();
  }, [fetchItinerary, fetchList, fetchProfile]);

  useEffect(() => {
    if (visitorId) {
      refreshDashboard();
    }
  }, [refreshDashboard, visitorId]);

  const isLoading = isLoadingItinerary || isLoadingProfile;

  return {
    itineraries,
    itinerary,
    profile,
    isLoading,
    toast,
    setItinerary,
    setProfile,
    setToast,
    triggerToast,
    refreshDashboard,
    fetchList
  };
}
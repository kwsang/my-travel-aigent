import { useState, useEffect, useRef } from 'react';
import { Itinerary, TravelerProfile } from '@/types';
import { API_CONFIG } from '@/config/constants';

function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

export function useAutoSave(
  itinerary: Partial<Itinerary>,
  profile: TravelerProfile | null | undefined,
  currentSessionId: string | undefined,
  visitorId: string | undefined,
  isLoading: boolean,
  triggerToast?: (msg: string) => void
) {
  const isInitialMount = useRef(true);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip the very first render and any renders while data is still loading.
    if (isInitialMount.current) {
      if (!isLoading) {
        isInitialMount.current = false;
        lastSavedPayloadRef.current = JSON.stringify({ ...itinerary, traveler_profile: profile });
      }
      return;
    }

    if (!currentSessionId || !visitorId) return;

    const debounceTimer = setTimeout(() => {
      const payload = { ...itinerary, traveler_profile: profile };
      const payloadString = JSON.stringify(payload);
      
      if (lastSavedPayloadRef.current === payloadString) {
        return; // Prevent saving if the payload hasn't actually changed
      }

      if (lastSavedPayloadRef.current) {
        try {
          const prev = JSON.parse(lastSavedPayloadRef.current);
          if (deepEqual(prev, payload)) {
            lastSavedPayloadRef.current = payloadString; // Update ref to new string order but skip save
            return;
          }
        } catch (e) {}
      }

      if (lastSavedPayloadRef.current) {
        try {
          const prev = JSON.parse(lastSavedPayloadRef.current);
          const diff = Object.keys(payload).reduce((acc: any, key) => {
            if (JSON.stringify(prev[key]) !== JSON.stringify((payload as any)[key])) {
              acc[key] = { old: prev[key], new: (payload as any)[key] };
            }
            return acc;
          }, {});
          console.log('Auto-saving changes:', diff);
        } catch (e) {
          console.log('Auto-saving draft...');
        }
      }

      lastSavedPayloadRef.current = payloadString;
      setIsAutoSaving(true);
      setShowSavedIndicator(false);

      fetch(`${API_CONFIG.BASE_URL}/itinerary/${currentSessionId}?user_id=${visitorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: payloadString,
      })
      .then(response => {
        if (response.ok) {
          console.log('Auto-save successful.');
          setShowSavedIndicator(true);
          if (savedIndicatorTimeoutRef.current) clearTimeout(savedIndicatorTimeoutRef.current);
          savedIndicatorTimeoutRef.current = setTimeout(() => setShowSavedIndicator(false), 3000);
        } else {
          triggerToast?.('Could not save changes.');
          console.error('Auto-save failed:', response);
        }
      })
      .catch(e => {
        triggerToast?.('Could not save changes.');
        console.error("Dashboard: Auto-save failed.", e);
      })
      .finally(() => setIsAutoSaving(false));
    }, 2500); // 2.5 second debounce delay

    return () => clearTimeout(debounceTimer);
  }, [itinerary, profile, currentSessionId, visitorId, isLoading, triggerToast]);

  return { isAutoSaving, showSavedIndicator };
}
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import TimelineView from '@/components/dashboard/TimelineView';
import BudgetPanel from '@/components/dashboard/BudgetPanel';
import MapHub from '@/components/dashboard/MapHub';
import ChatInterface from '@/components/dashboard/ChatInterface';
import Navbar from '@/components/layout/Navbar';
import { API_CONFIG } from '@/config/constants';
import { v4 as uuidv4 } from 'uuid';
import { Itinerary } from '@/types/models';

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<'total' | 'per_person'>('total');
  const [sessionId] = useState(() => uuidv4());
  const [itinerary, setItinerary] = useState<Partial<Itinerary>>({
    events: [],
    is_conflict: false,
    validation_errors: [],
    user_profile_data: undefined
  });

  /**
   * Fetches the latest itinerary state from the backend.
   * Called on initial load and whenever the agent provides a response.
   */
  const fetchItinerary = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setItinerary(data);
      }
    } catch (error) {
      console.warn('Dashboard: Could not fetch initial itinerary. It may not be created yet.');
    }
  }, [sessionId]);

  useEffect(() => {
    fetchItinerary();
  }, [fetchItinerary]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50">
      <Navbar />
      <main className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Timeline */}
        <div className="w-1/3 min-w-[400px] border-r border-slate-200 overflow-y-auto px-6 bg-white shadow-sm z-10">
          <div className="py-8 border-b border-slate-100 mb-6">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Travel Itinerary</h1>
            <p className="text-sm text-slate-500">Plan your next adventure with Travel AIgent</p>
          </div>
          <TimelineView 
            segments={itinerary.events || []} 
            viewMode={viewMode}
            partySize={itinerary.user_profile_data?.party_size || 1}
            riskTolerance={itinerary.user_profile_data?.preferences?.risk_tolerance}
          />
        </div>

        {/* Main Content: Map and Budget */}
        <div className="relative flex-1 bg-slate-100 overflow-hidden">
          <div className="absolute top-6 right-6 z-20">
            <BudgetPanel 
              segments={itinerary.events || []}
              budget={itinerary.user_profile_data?.budget}
              viewMode={viewMode}
              partySize={itinerary.user_profile_data?.party_size || 1}
              onToggleMode={() => setViewMode(v => v === 'total' ? 'per_person' : 'total')}
            />
          </div>
          
          <MapHub 
            segments={itinerary.events || []} 
            isRelaxed={itinerary.user_profile_data?.preferences?.risk_tolerance === 'relaxed'} 
          />

          <ChatInterface 
            sessionId={sessionId} 
            onMessageReceived={fetchItinerary} 
          />
        </div>
      </main>
    </div>
  );
}
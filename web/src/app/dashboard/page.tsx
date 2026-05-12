'use client';

import React, { useState, useEffect, useCallback } from 'react';
import TimelineView from '@/components/dashboard/TimelineView';
import MapHub from '@/components/dashboard/MapHub';
import BudgetPanel from '@/components/dashboard/BudgetPanel';
import ChatInterface from '@/components/dashboard/ChatInterface';
import Navbar from '@/components/layout/Navbar';
import { Itinerary } from '@/types/models';
import { API_CONFIG } from '@/config/constants';
import { v4 as uuidv4 } from 'uuid';

/**
 * The Visual Planning Dashboard
 * Entry point for ad-hoc travel planning with a fresh session.
 */
export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<'total' | 'per_person'>('total');
  const [sessionId] = useState(() => uuidv4());
  const [itinerary, setItinerary] = useState<Partial<Itinerary>>({
    events: [],
    is_conflict: false,
    validation_errors: [],
    user_profile_data: undefined
  });

  const fetchItinerary = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setItinerary(data);
        
        if (data.user_profile_data?.preferences?.group_planning_per_person) {
          setViewMode('per_person');
        }
      }
    } catch (error) {
      console.warn("Dashboard Sync: Session not active yet.");
    }
  }, [sessionId]);

  useEffect(() => {
    fetchItinerary();
  }, [fetchItinerary]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <Navbar />
      <main className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Timeline */}
        <div className="w-1/3 min-w-[400px] border-r border-border overflow-y-auto px-6 bg-card shadow-sm z-10">
          <div className="py-8 border-b border-border/50 mb-6">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {itinerary.trip_name || 'Travel Itinerary'}
            </h1>
            <p className="text-sm text-muted-foreground">Plan your next adventure with Travel AIgent</p>
          </div>
          <TimelineView 
            segments={itinerary.events || []} 
            viewMode={viewMode}
            partySize={itinerary.user_profile_data?.party_size || 1}
            riskTolerance={itinerary.user_profile_data?.preferences?.risk_tolerance}
          />
        </div>

        {/* Main Content: Map and Budget */}
        <div className="relative flex-1 bg-background overflow-hidden">
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
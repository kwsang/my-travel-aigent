'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import TimelineView from '@/components/dashboard/TimelineView';
import MapHub from '@/components/dashboard/MapHub';
import BudgetPanel from '@/components/dashboard/BudgetPanel';
import ArchitectOverlay from '@/components/dashboard/ArchitectOverlay';
import { Itinerary, UserProfile } from '@/types/models';

/**
 * The Visual Planning Dashboard
 * Synchronizes the Architect's output with a map and timeline.
 * Now fully typed to match the Phase 5 schema.
 */
export default function ItineraryDashboard() {
  const { id } = useParams();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<'total' | 'per_person'>('total');
  const [loading, setLoading] = useState(true);

  // Fetch the latest state from the FastAPI bridge
  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/itinerary/${id}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch itinerary: ${response.statusText}`);
        }
        
        const data: Itinerary = await response.json();
        
        // Sync Itinerary state
        setItinerary(data);
        
        // Sync Profile state from the embedded data returned by server.py
        if (data.user_profile_data) {
          setProfile(data.user_profile_data);
          
          // Apply initial view mode based on elicitation preferences
          if (data.user_profile_data.preferences?.group_planning_per_person) {
            setViewMode('per_person');
          }
        }
      } catch (error) {
        console.error("Dashboard Sync Error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) return <div className="flex h-screen items-center justify-center">Syncing with Architect...</div>;
  if (!itinerary) return <div className="flex h-screen items-center justify-center text-slate-500">Itinerary data unavailable.</div>;

  return (
    <main className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
      {/* Sidebar/Timeline Area */}
      <section className="flex flex-1 flex-col overflow-y-auto border-r border-slate-200 p-6">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{itinerary.trip_name || 'Your Trip'}</h1>
            <p className="text-slate-500 text-sm">{itinerary.events.length} segments planned</p>
          </div>
          
          <BudgetPanel 
            budget={profile?.budget} 
            segments={itinerary.events}
            partySize={profile?.party_size}
            viewMode={viewMode}
            onToggleMode={() => setViewMode(v => v === 'total' ? 'per_person' : 'total')}
          />
        </header>

        <TimelineView 
          segments={itinerary.events} 
          riskTolerance={profile?.preferences?.risk_tolerance}
          viewMode={viewMode}
          partySize={profile?.party_size}
        />
      </section>

      {/* Map Area */}
      <section className="relative flex-[0.8] bg-slate-200">
        <MapHub 
          segments={itinerary.events} 
          isRelaxed={profile?.preferences?.risk_tolerance === 'relaxed'}
        />
        
        {/* Overlay for Agent Interaction */}
        <ArchitectOverlay 
          validationErrors={itinerary.validation_errors} 
          partySize={profile?.party_size || 1} 
        />
      </section>
    </main>
  );
}
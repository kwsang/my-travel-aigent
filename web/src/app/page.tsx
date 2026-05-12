'use client';

import React, { useState } from 'react';
import TimelineView from '@/components/dashboard/TimelineView';
import BudgetPanel from '@/components/dashboard/BudgetPanel';
import MapHub from '@/components/dashboard/MapHub';
import ArchitectOverlay from '@/components/dashboard/ArchitectOverlay';

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<'total' | 'per_person'>('total');
  
  // Placeholder state for demonstration
  // In a real scenario, you would fetch this from your FastAPI /itinerary endpoint
  const [itinerary] = useState({
    events: [],
    is_conflict: false,
    validation_errors: []
  });

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      {/* Left Sidebar: Timeline */}
      <div className="w-1/3 border-r border-slate-200 overflow-y-auto px-6 bg-white">
        <div className="py-8 border-b border-slate-100 mb-4">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Travel Itinerary</h1>
          <p className="text-sm text-slate-500">Plan your next adventure with Gemini</p>
        </div>
        <TimelineView 
          segments={itinerary.events} 
          viewMode={viewMode}
          partySize={1}
        />
      </div>

      {/* Main Content: Map and Budget */}
      <div className="relative flex-1 bg-slate-100">
        <div className="absolute top-6 right-6 z-20">
          <BudgetPanel 
            segments={itinerary.events}
            viewMode={viewMode}
            onToggleMode={() => setViewMode(v => v === 'total' ? 'per_person' : 'total')}
          />
        </div>
        
        <MapHub segments={itinerary.events} isRelaxed={false} />
        
        <ArchitectOverlay 
          validationErrors={itinerary.validation_errors} 
          partySize={1} 
        />
      </div>
    </main>
  );
}
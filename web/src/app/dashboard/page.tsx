'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TimelineView from '@/components/dashboard/TimelineView';
import MapHub from '@/components/dashboard/MapHub';
import BudgetPanel from '@/components/dashboard/BudgetPanel';
import ChatInterface from '@/components/dashboard/ChatInterface';
import ProfileModal from '@/components/dashboard/ProfileModal';
import Toast from '@/components/dashboard/Toast';
import Navbar from '@/components/layout/Navbar';
import { Itinerary } from '@/types/models';
import { API_CONFIG } from '@/config/constants';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Clock, Search } from 'lucide-react';

/**
 * The Visual Planning Dashboard
 * Entry point for ad-hoc travel planning with a fresh session.
 */
export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<'total' | 'per_person'>('total');
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => uuidv4());
  
  // Persistent Visitor Identity. If not found, we use the first session ID.
  const [visitorId, setVisitorId] = useState<string>('');

  useEffect(() => {
    const stored = localStorage.getItem('travel_aigent_visitor_id');
    const id = stored || currentSessionId;
    if (!stored) localStorage.setItem('travel_aigent_visitor_id', id);
    setVisitorId(id);
  }, [currentSessionId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [profileHasBeenSet, setProfileHasBeenSet] = useState(false); // New state for profile status
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [itinerary, setItinerary] = useState<Partial<Itinerary>>({
    events: [],
    is_conflict: false,
    validation_errors: [],
    user_profile_data: undefined
  });

  // Sync editable name when the itinerary data loads
  useEffect(() => {
    setEditedName(itinerary.trip_name || '');
  }, [itinerary.trip_name]);

  // First time popup logic
  useEffect(() => {
    const storedProfileStatus = localStorage.getItem('travel_profile_set') === 'true';
    setProfileHasBeenSet(storedProfileStatus);
    if (!storedProfileStatus) {
      setShowProfileModal(true);
    }
  }, []);

  const filteredItineraries = useMemo(() => {
    return itineraries.filter(item => 
      (item.trip_name || 'Unnamed Trip').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [itineraries, searchQuery]);

  const fetchList = useCallback(async () => {
    if (!visitorId) return;
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary?user_id=${visitorId}`);
      if (response.ok) setItineraries(await response.json());
    } catch (e) {
      console.warn("Could not fetch trip list.");
    }
  }, [visitorId]);

  const fetchItinerary = useCallback(async () => {
    if (!currentSessionId) return;
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${currentSessionId}?user_id=${visitorId}`);
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
  }, [currentSessionId, visitorId]);

  useEffect(() => {
    fetchItinerary();
    fetchList();
  }, [fetchItinerary, fetchList]);

  const handleRename = async () => {
    if (!editedName.trim() || editedName === itinerary.trip_name) {
      setIsEditingName(false);
      return;
    }

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${currentSessionId}?user_id=${visitorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trip_name: editedName,
          events: itinerary.events || []
        }),
      });

      if (response.ok) {
        const updated = await response.json();
        setItinerary(updated);
        fetchList(); // Update the sidebar list immediately
        triggerToast('Itinerary renamed successfully!');
      }
    } catch (e) {
      console.warn("Dashboard: Failed to rename itinerary.");
    }
    setIsEditingName(false);
  };

  const triggerToast = (message: string) => {
    setToast({ show: true, message });
  };

  const handleNewTrip = () => {
    setCurrentSessionId(uuidv4());
    setIsEditingName(false);
    setItinerary({ events: [], is_conflict: false, validation_errors: [] });
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <Navbar 
        onEditProfile={() => setShowProfileModal(true)} 
        profileSetStatus={profileHasBeenSet} // Pass the status to Navbar
      />
      <main className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Timeline */}
        <div className="w-1/3 min-w-[400px] border-r border-border overflow-y-auto px-6 bg-card shadow-sm z-10">
          <div className="py-8 border-b border-border/50 mb-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                {isEditingName ? (
                  <input
                    autoFocus
                    className="text-2xl font-bold text-foreground tracking-tight bg-transparent border-b-2 border-primary outline-none w-full"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                  />
                ) : (
                  <h1 
                    className="text-2xl font-bold text-foreground tracking-tight cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setIsEditingName(true)}
                  >
                    {itinerary.trip_name || 'New Trip'}
                  </h1>
                )}
                <p className="text-sm text-muted-foreground">Collaborating with Travel AIgent</p>
              </div>
              <button 
                onClick={handleNewTrip}
                className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Start New Trip"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Search Bar */}
            {itineraries.length > 0 && (
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  type="text"
                  placeholder="Filter trips..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            )}

            {/* Recent Trips Selector */}
            {itineraries.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Clock size={12} />
                  Your Recent Trips
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {filteredItineraries.map((item) => (
                    <button
                      key={item.session_id}
                      onClick={() => setCurrentSessionId(item.session_id)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                        currentSessionId === item.session_id
                          ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20'
                          : 'border-border bg-white/5 text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {item.trip_name || 'Unnamed Trip'}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            sessionId={currentSessionId}
            userId={visitorId}
            onMessageReceived={() => { fetchItinerary(); fetchList(); }} 
          />
        </div>
      </main>

      {showProfileModal && (
        <ProfileModal 
          userId={visitorId}
          initialData={itinerary.user_profile_data}
          onClose={() => setShowProfileModal(false)}
          onSave={() => {
            fetchItinerary();
            setProfileHasBeenSet(true); // Update status after saving
            triggerToast('Traveler profile updated successfully!');
          }}
        />
      )}

      {toast.show && (
        <Toast 
          message={toast.message} 
          onClose={() => setToast({ ...toast, show: false })} 
        />
      )}
    </div>
  );
}
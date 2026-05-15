'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TimelineView from '@/components/dashboard/timeline/TimelineView';
import MapHub from '@/components/dashboard/map/MapHub';
import BudgetPanel from '@/components/dashboard/budget/BudgetPanel';
import ChatInterface from '@/components/dashboard/chat/ChatInterface';
import ProfileModal from '@/components/dashboard/ProfileModal';
import Toast from '@/components/dashboard/Toast';
import Navbar from '@/components/layout/Navbar';
import { Itinerary, TravelerProfile } from '@/types';
import { API_CONFIG } from '@/config/constants';
import { v4 as uuidv4 } from 'uuid';
import { ItineraryContext } from '@/context/ItineraryContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import SkeletonWrapper from '@/components/dashboard/SkeletonWrapper';
import TimelineSkeleton from '@/components/dashboard/timeline/TimelineSkeleton';
import BudgetSkeleton from '@/components/dashboard/budget/BudgetSkeleton';
import TripSelector from '@/components/dashboard/TripSelector';
import ErrorBoundary from '@/components/dashboard/ErrorBoundary';
import { UserCircle } from 'lucide-react';
import DeleteTripModal from '@/components/dashboard/DeleteTripModal';
import RenameAlertModal from '@/components/dashboard/RenameAlertModal';

/**
 * The Visual Planning Dashboard
 * Entry point for ad-hoc travel planning with a fresh session.
 */
export default function DashboardPage() {
  const [viewMode, setViewMode] = useLocalStorage<'total' | 'per_person'>('travel_aigent_view_mode', 'total');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [visitorId, setVisitorId] = useState<string>('');

  // Initialize and persist Visitor and Session IDs safely on the client
  useEffect(() => {
    const storedVisitor = localStorage.getItem('travel_aigent_visitor_id');
    const storedSession = localStorage.getItem('travel_aigent_last_session_id');
    
    const initialSession = storedSession || uuidv4();
    const initialVisitor = storedVisitor || initialSession;

    if (!storedVisitor) localStorage.setItem('travel_aigent_visitor_id', initialVisitor);
    if (!storedSession) localStorage.setItem('travel_aigent_last_session_id', initialSession);

    setCurrentSessionId(initialSession);
    setVisitorId(initialVisitor);
  }, []);

  // Keep localStorage in sync when the user switches or creates sessions
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('travel_aigent_last_session_id', currentSessionId);
    }
  }, [currentSessionId]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);
  const [showBlankNameAlert, setShowBlankNameAlert] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);

  // Extracted Data Fetching Hook
  const {
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
  } = useDashboardData(visitorId, currentSessionId);

  // Sidebar Resizing State
  const { sidebarWidth, isDragging, setIsDragging, sidebarRef } = useSidebarResize();

  // Sync editable name when the itinerary data loads
  useEffect(() => {
    setEditedName(itinerary.trip_name || 'New Trip');
  }, [itinerary.trip_name]);

  // Automatically switch to per-person view if the profile is set to it
  useEffect(() => {
    if (profile?.preferences?.group_planning_per_person) {
      setViewMode('per_person');
    }
  }, [profile, setViewMode]);

  // Reset map highlights when changing trips
  useEffect(() => {
    setActiveSegmentIndex(null);
  }, [currentSessionId]);

  const handleRename = async () => {
    const newName = editedName.trim();
    
    if (!newName) {
      setShowBlankNameAlert(true);
      return;
    }

    if (newName === itinerary.trip_name) {
      setIsEditingName(false);
      return;
    }

    setIsEditingName(false);
    setItinerary(prev => ({ ...prev, trip_name: newName })); // Optimistic UI update

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${currentSessionId}?user_id=${visitorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trip_name: newName,
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
      setItinerary(prev => ({ ...prev, trip_name: itinerary.trip_name })); // Revert on failure
    }
  };

  const handleDeleteTrip = (e: React.MouseEvent, sessId: string) => {
    e.stopPropagation();
    setTripToDelete(sessId);
  };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/itinerary/${tripToDelete}?user_id=${visitorId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchList();
        if (currentSessionId === tripToDelete) {
          handleNewTrip();
        }
        triggerToast('Trip deleted successfully.');
      }
    } catch (e) {
      console.error("Dashboard: Delete failed", e);
    } finally {
      setTripToDelete(null);
    }
  };

  const handleNewTrip = () => {
    setCurrentSessionId(uuidv4());
    setIsEditingName(false);
    setItinerary({ events: [], is_conflict: false, validation_errors: [] });
    setActiveSegmentIndex(null);
    setShowProfileModal(true);
    triggerToast('Started a new trip!');
  };

  // Center content for the Navbar
  const navbarCenter = (
    <TripSelector
      itineraries={itineraries}
      currentItinerary={itinerary}
      currentSessionId={currentSessionId}
      onSelectTrip={(sessId, item) => {
        setCurrentSessionId(sessId);
        setItinerary(item);
      }}
      onNewTrip={handleNewTrip}
      onDeleteTrip={handleDeleteTrip}
      isEditingName={isEditingName}
      setIsEditingName={setIsEditingName}
      editedName={editedName}
      setEditedName={setEditedName}
      onRename={handleRename}
    />
  );

  // Memoize the context value to prevent unnecessary re-renders of all consumer components
  const contextValue = useMemo(() => ({
    itinerary,
    profile,
    setItinerary,
    setProfile,
    viewMode,
    setViewMode,
    refreshDashboard,
    sessionId: currentSessionId,
    userId: visitorId,
    isLoading,
    activeSegmentIndex,
    setActiveSegmentIndex,
    hoveredSegmentIndex,
    setHoveredSegmentIndex
  }), [itinerary, profile, setItinerary, setProfile, viewMode, setViewMode, refreshDashboard, currentSessionId, visitorId, isLoading, activeSegmentIndex, hoveredSegmentIndex]);

  return (
    <ItineraryContext.Provider value={contextValue}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <Navbar 
        centerContent={navbarCenter}
      />
      <main className={`flex flex-1 overflow-hidden ${isDragging ? 'select-none cursor-col-resize' : ''}`}>
        {/* Left Sidebar: Timeline */}
        <div 
          ref={sidebarRef}
          className="shrink-0 overflow-y-auto px-6 bg-card shadow-sm z-10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="py-6 border-b border-border/50 mb-6 flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Itinerary Timeline</h2>
              <button onClick={() => setShowProfileModal(true)} className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md">
                <UserCircle size={12} /> Traveler Profile
              </button>
            </div>
            <ErrorBoundary fallbackMessage="Failed to load budget panel.">
              <SkeletonWrapper isLoading={isLoading} fallback={<BudgetSkeleton />}>
                <BudgetPanel />
              </SkeletonWrapper>
            </ErrorBoundary>
          </div>
          <ErrorBoundary fallbackMessage="Failed to load timeline.">
            <SkeletonWrapper isLoading={isLoading} fallback={<TimelineSkeleton />}>
              <TimelineView />
            </SkeletonWrapper>
          </ErrorBoundary>
        </div>

        {/* Resizable Drag Handle */}
        <div
          className={`w-1 cursor-col-resize shrink-0 z-20 hover:bg-primary transition-colors ${
            isDragging ? 'bg-primary' : 'bg-border'
          }`}
          onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
        />

        {/* Main Content: Map and Budget */}
        <div className={`relative flex-1 bg-background overflow-hidden ${isDragging ? 'pointer-events-none' : ''}`}>
          
          <ErrorBoundary fallbackMessage="Failed to load map workspace.">
            <MapHub />
          </ErrorBoundary>

          <ErrorBoundary fallbackMessage="Failed to load chat interface.">
            <ChatInterface 
              sessionId={currentSessionId}
              userId={visitorId}
              onMessageReceived={refreshDashboard} 
            />
          </ErrorBoundary>
        </div>
      </main>

      {showProfileModal && (
        <ProfileModal 
          sessionId={currentSessionId}
          userId={visitorId}
          initialData={profile || undefined}
          onClose={() => setShowProfileModal(false)}
          onSave={(newProfile) => {
            setProfile(newProfile);
            refreshDashboard();
            triggerToast('Traveler profile updated successfully!');
          }}
        />
      )}

      {tripToDelete && (
        <DeleteTripModal 
          onClose={() => setTripToDelete(null)}
          onConfirm={confirmDeleteTrip}
        />
      )}

      {showBlankNameAlert && (
        <RenameAlertModal 
          onDiscard={() => {
            setEditedName(itinerary.trip_name || 'New Trip');
            setShowBlankNameAlert(false);
            setIsEditingName(false);
          }}
          onKeepEditing={() => setShowBlankNameAlert(false)}
        />
      )}

      {toast.show && (
        <Toast 
          message={toast.message} 
          onClose={() => setToast({ ...toast, show: false })} 
        />
      )}
    </div>
    </ItineraryContext.Provider>
  );
}
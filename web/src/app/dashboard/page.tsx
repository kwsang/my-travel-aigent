'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TimelineView from '@/components/dashboard/timeline/TimelineView';
import MapHub from '@/components/dashboard/MapHub';
import BudgetPanel from '@/components/dashboard/BudgetPanel';
import ChatInterface from '@/components/dashboard/ChatInterface';
import ProfileModal from '@/components/dashboard/ProfileModal';
import Toast from '@/components/dashboard/Toast';
import Navbar from '@/components/layout/Navbar';
import { Itinerary } from '@/types';
import { API_CONFIG } from '@/config/constants';
import { v4 as uuidv4 } from 'uuid';
import { ItineraryContext } from '@/context/ItineraryContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import SkeletonWrapper from '@/components/dashboard/SkeletonWrapper';
import TimelineSkeleton from '@/components/dashboard/timeline/TimelineSkeleton';
import BudgetSkeleton from '@/components/dashboard/BudgetSkeleton';
import TripSelector from '@/components/dashboard/TripSelector';
import { Trash2, AlertTriangle } from 'lucide-react';

/**
 * The Visual Planning Dashboard
 * Entry point for ad-hoc travel planning with a fresh session.
 */
export default function DashboardPage() {
  const [viewMode, setViewMode] = useLocalStorage<'total' | 'per_person'>('travel_aigent_view_mode', 'total');
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => uuidv4());
  
  // Persistent Visitor Identity. If not found, we use the first session ID.
  const [visitorId, setVisitorId] = useState<string>('');

  useEffect(() => {
    const stored = localStorage.getItem('travel_aigent_visitor_id');
    const id = stored || currentSessionId;
    if (!stored) localStorage.setItem('travel_aigent_visitor_id', id);
    setVisitorId(id);
  }, [currentSessionId]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [profileHasBeenSet, setProfileHasBeenSet] = useState(false); // New state for profile status
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);
  const [showBlankNameAlert, setShowBlankNameAlert] = useState(false);
  const [itinerary, setItinerary] = useState<Partial<Itinerary>>({
    events: [],
    is_conflict: false,
    validation_errors: [],
    user_profile_data: undefined
  });
  const [isLoadingItinerary, setIsLoadingItinerary] = useState(true);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  // Sidebar Resizing State
  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('travel_aigent_sidebar_width', 400);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      // Clamp the sidebar width between 300px and 800px
      const newWidth = Math.max(300, Math.min(e.clientX, 800));
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      const finalWidth = Math.max(300, Math.min(e.clientX, 800));
      setSidebarWidth(finalWidth);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setSidebarWidth]);

  // Sync editable name when the itinerary data loads
  useEffect(() => {
    setEditedName(itinerary.trip_name || 'New Trip');
  }, [itinerary.trip_name]);

  // First time popup logic
  useEffect(() => {
    const storedProfileStatus = localStorage.getItem('travel_profile_set') === 'true';
    setProfileHasBeenSet(storedProfileStatus);
    if (!storedProfileStatus) {
      setShowProfileModal(true);
    }
  }, []);

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
    if (!currentSessionId || !visitorId) return;
    setIsLoadingItinerary(true);
    setActiveSegmentIndex(null); // Reset active map highlight when switching trips
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
    } finally {
      setIsLoadingItinerary(false);
    }
  }, [currentSessionId, visitorId]);

  // Centralized dashboard update logic to ensure single points of refresh
  const refreshDashboard = useCallback(() => {
    fetchItinerary();
    fetchList();
  }, [fetchItinerary, fetchList]);

  useEffect(() => {
    if (visitorId) {
      refreshDashboard();
    }
  }, [refreshDashboard, visitorId]);

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

  const triggerToast = (message: string) => {
    setToast({ show: true, message });
  };

  const handleNewTrip = () => {
    setCurrentSessionId(uuidv4());
    setIsEditingName(false);
    setItinerary({ events: [], is_conflict: false, validation_errors: [] });
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
    setItinerary,
    viewMode,
    setViewMode,
    refreshDashboard,
    sessionId: currentSessionId,
    userId: visitorId,
    isLoading: isLoadingItinerary,
    activeSegmentIndex,
    setActiveSegmentIndex
  }), [itinerary, viewMode, setViewMode, refreshDashboard, currentSessionId, visitorId, isLoadingItinerary, activeSegmentIndex]);

  return (
    <ItineraryContext.Provider value={contextValue}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <Navbar 
        onEditProfile={() => setShowProfileModal(true)} 
        profileSetStatus={profileHasBeenSet} // Pass the status to Navbar
        centerContent={navbarCenter}
      />
      <main className={`flex flex-1 overflow-hidden ${isDragging ? 'select-none cursor-col-resize' : ''}`}>
        {/* Left Sidebar: Timeline */}
        <div 
          ref={sidebarRef}
          className="shrink-0 overflow-y-auto px-6 bg-card shadow-sm z-10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="py-6 border-b border-border/50 mb-6 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Itinerary Timeline</h2>
            <SkeletonWrapper isLoading={isLoadingItinerary} fallback={<BudgetSkeleton />}>
              <BudgetPanel />
            </SkeletonWrapper>
          </div>
          <SkeletonWrapper isLoading={isLoadingItinerary} fallback={<TimelineSkeleton />}>
            <TimelineView />
          </SkeletonWrapper>
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
          
          <MapHub />

          <ChatInterface 
            sessionId={currentSessionId}
            userId={visitorId}
            onMessageReceived={refreshDashboard} 
          />
        </div>
      </main>

      {showProfileModal && (
        <ProfileModal 
          userId={visitorId}
          initialData={itinerary.user_profile_data}
          onClose={() => setShowProfileModal(false)}
          onSave={() => {
            refreshDashboard();
            setProfileHasBeenSet(true); // Update status after saving
            triggerToast('Traveler profile updated successfully!');
          }}
        />
      )}

      {tripToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm p-6 relative ring-1 ring-white/5 flex flex-col items-center text-center">
            <div className="bg-destructive/20 p-3 rounded-full mb-4">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Delete Trip?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this trip and its history? This action cannot be undone.
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setTripToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteTrip}
                className="flex-1 bg-destructive text-destructive-foreground px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-destructive/20 hover:brightness-110 active:scale-95 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showBlankNameAlert && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm p-6 relative ring-1 ring-white/5 flex flex-col items-center text-center">
            <div className="bg-amber-500/20 p-3 rounded-full mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Blank Trip Name</h3>
            <p className="text-sm text-muted-foreground mb-6">
              A trip name cannot be empty. Please enter a valid name or discard changes.
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => {
                  setEditedName(itinerary.trip_name || 'New Trip');
                  setShowBlankNameAlert(false);
                  setIsEditingName(false);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all"
              >
                Discard
              </button>
              <button 
                onClick={() => setShowBlankNameAlert(false)}
                className="flex-1 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
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
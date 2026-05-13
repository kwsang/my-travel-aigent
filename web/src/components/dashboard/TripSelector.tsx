import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, ChevronDown, Edit2, Plus, Check } from 'lucide-react';
import { Itinerary } from '@/types';

interface TripSelectorProps {
  itineraries: Itinerary[];
  currentItinerary: Partial<Itinerary>;
  currentSessionId: string;
  onSelectTrip: (session_id: string, itinerary: Itinerary) => void;
  onNewTrip: () => void;
  onDeleteTrip: (e: React.MouseEvent, session_id: string) => void;
  isEditingName: boolean;
  setIsEditingName: (val: boolean) => void;
  editedName: string;
  setEditedName: (val: string) => void;
  onRename: () => void;
}

export default function TripSelector({
  itineraries,
  currentItinerary,
  currentSessionId,
  onSelectTrip,
  onNewTrip,
  onDeleteTrip,
  isEditingName,
  setIsEditingName,
  editedName,
  setEditedName,
  onRename
}: TripSelectorProps) {
  const [showTripDropdown, setShowTripDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItineraries = useMemo(() => {
    return itineraries.filter(item => 
      (item.trip_name || 'Unnamed Trip').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [itineraries, searchQuery]);

  // Handle clicking outside the custom trip selector dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTripDropdown && !(e.target as Element).closest('.trip-selector-dropdown')) {
        setShowTripDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTripDropdown]);

  return (
    <div className="trip-selector-dropdown relative flex items-center justify-center z-50">
      {isEditingName ? (
        <input
          autoFocus
          className="text-xl font-bold text-foreground tracking-tight bg-transparent border-b-2 border-primary outline-none w-96 text-center"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onBlur={onRename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      ) : (
        <div 
          className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors px-4 py-2 rounded-xl hover:bg-white/5" 
          onClick={() => setShowTripDropdown(!showTripDropdown)}
        >
          <span className="font-bold text-xl text-foreground tracking-tight max-w-[400px] truncate">
            {currentItinerary.trip_name || 'New Trip'}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${currentItinerary.status === 'final' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
            {currentItinerary.status || 'draft'}
          </span>
          <ChevronDown size={18} className={`text-muted-foreground transition-transform ${showTripDropdown ? 'rotate-180' : ''}`} />
        </div>
      )}

      {showTripDropdown && !isEditingName && (
        <div className="absolute top-full mt-2 w-80 bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
          {itineraries.length > 0 && (
            <div className="p-3 border-b border-white/10 bg-white/5">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  type="text"
                  placeholder="Filter trips..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            </div>
          )}
          <div className="p-2 space-y-1 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
            {filteredItineraries.map(item => (
              <div 
                key={item.session_id} 
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${currentSessionId === item.session_id ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-foreground'}`}
                onClick={() => { 
                  onSelectTrip(item.session_id, item);
                  setShowTripDropdown(false); 
                }}
              >
                 <div className="flex items-center gap-2 overflow-hidden pr-2">
                   {currentSessionId === item.session_id ? (
                     <Check size={16} className="shrink-0" />
                   ) : (
                     /* Spacer for text alignment */
                     <div className="w-4 shrink-0" />
                   )}
                   <span className="font-medium text-sm truncate">{item.trip_name || 'Unnamed Trip'}</span>
                 </div>
                 <button 
                   onClick={(e) => onDeleteTrip(e, item.session_id)}
                   className="opacity-50 hover:opacity-100 hover:text-destructive transition-opacity shrink-0"
                 >
                   <Trash2 size={14} />
                 </button>
              </div>
            ))}
            {filteredItineraries.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground italic">No trips found</div>
            )}
          </div>
          <div className="p-2 border-t border-white/10 bg-white/5 space-y-1">
            <button className="w-full flex items-center gap-2 p-2.5 hover:bg-white/5 rounded-xl text-sm font-semibold transition-colors" onClick={() => { setIsEditingName(true); setShowTripDropdown(false); }}>
              <Edit2 size={16} className="text-muted-foreground" /> Rename Current
            </button>
            <button className="w-full flex items-center gap-2 p-2.5 hover:bg-primary/20 bg-primary/10 text-primary rounded-xl text-sm font-semibold transition-colors" onClick={() => { onNewTrip(); setShowTripDropdown(false); }}>
              <Plus size={16} /> Start New Trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
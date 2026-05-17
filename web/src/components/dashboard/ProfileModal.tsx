'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, Wallet, Shield, SunMoon, Save, Loader2, Bed, Bus, Zap, ArrowRight, ArrowLeft, Sparkles, Calendar, AlertCircle, Navigation } from 'lucide-react';
import { API_CONFIG, PROFILE_OPTIONS } from '@/config/constants';
import ThemedSelect from './ThemedSelect';
import { ProfileFormData } from '@/types/profile';
import { TravelerProfile } from '@/types';
import { parseProfileData } from '@/utils/profileUtils';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';

const getTodayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MAPS_LIBRARIES: ("places")[] = ["places"];

interface ProfileModalProps {
  sessionId: string;
  userId: string;
  initialData?: TravelerProfile;
  onClose: () => void;
  onSave: (profile: TravelerProfile) => void;
}

export default function ProfileModal({ sessionId, userId, initialData, onClose, onSave }: ProfileModalProps) {
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState<ProfileFormData>(parseProfileData(initialData));
  const [isFetching, setIsFetching] = useState(!initialData);
  const [isSaving, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(initialData?.preferences?.start_date || getTodayString());
  const [endDate, setEndDate] = useState(initialData?.preferences?.end_date || '');

  // YYYY-MM-DD strings can be safely compared lexicographically
  const isDateError = Boolean(startDate && endDate && startDate > endDate);

  useEffect(() => {
    if (initialData) {
      const parsed = parseProfileData(initialData);
      // Ensure newly added fields aren't stripped by older parseProfileData utility
      parsed.preferences.start_date = initialData.preferences?.start_date || getTodayString();
      parsed.preferences.end_date = initialData.preferences?.end_date;
      parsed.preferences.target_duration_days = initialData.preferences?.target_duration_days;
      parsed.preferences.starting_location = initialData.preferences?.starting_location;
      
      setFormData(parsed);
      setStartDate(initialData.preferences?.start_date || getTodayString());
      setEndDate(initialData.preferences?.end_date || '');
      setIsFetching(false);
    } else {
      setIsFetching(false);
    }
  }, [initialData]);

  const toggleInterest = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);

    // Ensure dates are perfectly synced before saving to bypass any local state desyncs
    const dataToSave = {
      ...formData,
      preferences: {
        ...formData.preferences,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }
    };

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/profile/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      });
      if (response.ok) {
        const updatedProfile = await response.json();
        onSave(updatedProfile);

        if (initialData) {
          const oldPrefs = initialData.preferences || ({} as any);
          const newPrefs = updatedProfile.preferences || ({} as any);
          
          const pioneerFieldsChanged = 
            oldPrefs.transport_preference !== newPrefs.transport_preference ||
            oldPrefs.personal_transport_available !== newPrefs.personal_transport_available ||
            oldPrefs.starting_location !== newPrefs.starting_location ||
            initialData.room_sharing !== updatedProfile.room_sharing ||
            initialData.people_per_room !== updatedProfile.people_per_room;

          const activityFieldsChanged = 
            JSON.stringify(initialData.interests || []) !== JSON.stringify(updatedProfile.interests || []) ||
            oldPrefs.circadian_preference !== newPrefs.circadian_preference ||
            oldPrefs.risk_tolerance !== newPrefs.risk_tolerance;

          const generalFieldsChanged = 
            JSON.stringify(initialData.budget || {}) !== JSON.stringify(updatedProfile.budget || {}) ||
            initialData.party_size !== updatedProfile.party_size ||
            oldPrefs.group_planning_per_person !== newPrefs.group_planning_per_person ||
            oldPrefs.start_date !== newPrefs.start_date ||
            oldPrefs.end_date !== newPrefs.end_date ||
            oldPrefs.target_duration_days !== newPrefs.target_duration_days;

          let targetAgent = '';
          let changeDesc = '';

          if (generalFieldsChanged) {
            targetAgent = 'architect';
            changeDesc = 'general trip constraints (like budget, dates, or party size)';
          } else if (pioneerFieldsChanged && activityFieldsChanged) {
            targetAgent = 'architect';
            changeDesc = 'transportation and activity preferences';
          } else if (pioneerFieldsChanged) {
            targetAgent = 'travel_pioneer';
            changeDesc = 'transportation or lodging preferences';
          } else if (activityFieldsChanged) {
            targetAgent = 'activity_planner';
            changeDesc = 'activity, dining, or scheduling preferences';
          }

          if (targetAgent) {
            window.dispatchEvent(new CustomEvent('travel_aigent_profile_updated', { 
              detail: { updatedProfile, targetAgent, changeDesc } 
            }));
          }
        }

        onClose();
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-card/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8 relative ring-1 ring-white/5">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-muted-foreground hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white text-white-outline tracking-tight">Traveler Profile</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {page === 1 ? "Step 1: Group & Budget" : page === 2 ? "Step 2: Style & Transit" : "Step 3: Dates & Duration"}
              </p>
            </div>
            <ProfileProgressRing page={page} />
          </div>
        </div>

        {isFetching ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm italic">Loading preferences...</p>
          </div>
        ) : (
          <div className="space-y-6 min-h-[340px]">
          {page === 1 ? (
            <ProfilePageOne formData={formData} setFormData={setFormData} toggleInterest={toggleInterest} />
          ) : page === 2 ? (
            <ProfilePageTwo formData={formData} setFormData={setFormData} />
          ) : (
            <ProfilePageThree 
              formData={formData} 
              setFormData={setFormData} 
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
              isDateError={isDateError}
            />
          )}
          </div>
        )}

        <div className="mt-10 flex gap-3">
          {page === 1 ? (
            <>
              <button onClick={onClose} className="flex-1 px-6 py-3 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all">Skip</button>
              <button onClick={() => setPage(2)} className="flex-1 bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2">Next <ArrowRight size={18} /></button>
            </>
          ) : page === 2 ? (
            <>
              <button onClick={() => setPage(1)} className="px-6 py-3 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all flex items-center gap-2"><ArrowLeft size={18} /> Back</button>
              <button onClick={() => setPage(3)} className="flex-1 bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2">Next <ArrowRight size={18} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setPage(2)} className="px-6 py-3 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all flex items-center gap-2"><ArrowLeft size={18} /> Back</button>
              <button onClick={handleSave} disabled={isSaving || isDateError} className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none">{isSaving ? "Saving..." : <><Save size={18} /> Save Profile</>}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProfilePageProps {
  formData: ProfileFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  toggleInterest?: (interest: string) => void;
}

function ProfileProgressRing({ page }: { page: number }) {
  return (
    <div className="relative w-12 h-12">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        <circle
          className="text-white/10 stroke-current"
          strokeWidth="8"
          cx="50"
          cy="50"
          r="40"
          fill="transparent"
        />
        <circle
          className="text-primary progress-ring-circle stroke-current"
          strokeWidth="8"
          strokeLinecap="round"
          cx="50"
          cy="50"
          r="40"
          fill="transparent"
          strokeDasharray={`${(page / 3) * 100 * 2.51}, 251.2`}
          strokeDashoffset="0"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-primary">{Math.round((page / 3) * 100)}%</span>
      </div>
    </div>
  );
}

function ProfilePageOne({ formData, setFormData, toggleInterest }: ProfilePageProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <Users size={14} /> Party Size
          </label>
          <input 
            type="number"
            min="1"
            onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
            value={formData.party_size}
            onChange={(e) => setFormData({...formData, party_size: Math.abs(parseInt(e.target.value) || 0)})}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-white-outline focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            placeholder="Total travelers"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <Bed size={14} /> Per Room
          </label>
          <input 
            type="number"
            min="1"
            onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
            disabled={!formData.room_sharing}
            value={formData.people_per_room}
            onChange={(e) => setFormData({...formData, people_per_room: Math.abs(parseInt(e.target.value) || 0)})}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-white-outline focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-30"
            placeholder="2"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Wallet size={14} /> Target Budget
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
            {formData.budget?.currency === 'USD' ? '$' : formData.budget?.currency || '$'}
          </span>
          <input 
            type="number"
            min="0"
            onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
            value={formData.budget?.total_limit || ''}
            onChange={(e) => setFormData({...formData, budget: { total_limit: Math.abs(parseFloat(e.target.value) || 0), currency: formData.budget?.currency || 'USD' }})}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white text-white-outline focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            placeholder="Total trip budget"
          />
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Sparkles size={14} /> Interests
        </label>
        <div className="flex flex-wrap gap-2">
          {PROFILE_OPTIONS.TRAVEL_INTERESTS.map(interest => (
            <button
              key={interest}
              onClick={() => toggleInterest?.(interest)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                formData.interests.includes(interest)
                  ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'border-white/10 bg-white/5 text-muted-foreground hover:border-primary/50'
              }`}
            >
              {interest}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/10">
        <input 
          type="checkbox"
          id="room_sharing"
          checked={formData.room_sharing}
          onChange={(e) => setFormData({...formData, room_sharing: e.target.checked})}
          className="w-5 h-5 rounded border-white/10 bg-card text-primary focus:ring-primary/50"
        />
        <label htmlFor="room_sharing" className="text-sm font-medium text-white cursor-pointer select-none">
          Group members share rooms?
        </label>
      </div>
    </div>
  );
}

interface ProfilePageThreeProps extends ProfilePageProps {
  startDate: string;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  endDate: string;
  setEndDate: React.Dispatch<React.SetStateAction<string>>;
  isDateError: boolean;
}

function ProfilePageThree({ formData, setFormData, startDate, setStartDate, endDate, setEndDate, isDateError }: ProfilePageThreeProps) {
  
  const handleDateChange = (newStart: string, newEnd: string) => {
    setStartDate(newStart);
    setEndDate(newEnd);
    
    let diffDays = formData.preferences.target_duration_days;
    
    if (newStart && newEnd) {
      // Safely parse parts to avoid timezone offset and DST bugs when calculating durations
      const [startYear, startMonth, startDay] = newStart.split('-').map(Number);
      const [endYear, endMonth, endDay] = newEnd.split('-').map(Number);
      
      const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
      const endUtc = Date.UTC(endYear, endMonth - 1, endDay);

      if (endUtc >= startUtc) {
        const diffTime = endUtc - startUtc;
        diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    setFormData(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        target_duration_days: diffDays,
        start_date: newStart || undefined,
        end_date: newEnd || undefined
      }
    }));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Calendar size={14} /> Start Date
        </label>
        <input 
          type="date"
          value={startDate}
          onChange={(e) => handleDateChange(e.target.value, endDate)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-white-outline focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all [color-scheme:dark]"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Calendar size={14} /> End Date
        </label>
        <input 
          type="date"
          value={endDate}
          min={startDate}
          onChange={(e) => handleDateChange(startDate, e.target.value)}
          className={`w-full bg-white/5 border ${isDateError ? 'border-destructive focus:ring-destructive/50' : 'border-white/10 focus:ring-primary/50'} rounded-xl px-4 py-3 text-white text-white-outline focus:outline-none focus:ring-2 transition-all [color-scheme:dark]`}
        />
      </div>

      {isDateError && (
        <div className="flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-destructive border border-destructive/20 animate-in fade-in slide-in-from-top-2">
          <AlertCircle size={16} className="shrink-0" />
          <span className="text-sm font-semibold">End date cannot be before start date.</span>
        </div>
      )}

      {!!formData.preferences.target_duration_days && startDate && endDate && !isDateError && (
        <div className="mt-8 flex items-center justify-center gap-3 bg-primary/10 border border-primary/20 p-4 rounded-xl">
          <Sparkles className="text-primary w-5 h-5" />
          <span className="text-sm font-medium text-white">
            Trip Duration: <span className="font-bold text-primary">{formData.preferences.target_duration_days} Days</span>
          </span>
        </div>
      )}
    </div>
  );
}

function ProfilePageTwo({ formData, setFormData }: ProfilePageProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Navigation size={14} /> Starting Location
        </label>
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''} libraries={MAPS_LIBRARIES as any}>
          <LocationAutocomplete 
            value={formData.preferences.starting_location || ''}
            onChange={(val) => setFormData({...formData, preferences: {...formData.preferences, starting_location: val}})}
          />
        </APIProvider>
      </div>

      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
        <input 
          type="checkbox"
          id="group_planning"
          checked={formData.preferences.group_planning_per_person}
          onChange={(e) => setFormData({...formData, preferences: {...formData.preferences, group_planning_per_person: e.target.checked}})}
          className="w-5 h-5 rounded border-white/10 bg-card text-primary focus:ring-primary/50"
        />
        <label htmlFor="group_planning" className="text-sm font-medium text-white cursor-pointer select-none">
          Plan budget on a per-person basis?
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-2">
        <ThemedSelect
          label="Buffer"
          icon={Shield}
          value={formData.preferences.risk_tolerance}
          onChange={(val) => setFormData({...formData, preferences: {...formData.preferences, risk_tolerance: val as 'relaxed' | 'strict'}})}
          options={PROFILE_OPTIONS.RISK_TOLERANCES}
        />
        <ThemedSelect
        label="Sleep Type"
          icon={SunMoon}
          value={formData.preferences.circadian_preference}
          onChange={(val) => setFormData({...formData, preferences: {...formData.preferences, circadian_preference: val as 'early_bird' | 'night_owl'}})}
          options={PROFILE_OPTIONS.CIRCADIAN_PREFERENCES}
        />
      </div>

      <ThemedSelect
        label="Transport"
        icon={Bus}
        value={formData.preferences.transport_preference}
        onChange={(val) => setFormData({...formData, preferences: {...formData.preferences, transport_preference: val as 'public' | 'rideshare' | 'rental'}})}
        options={PROFILE_OPTIONS.TRANSPORT_OPTIONS}
      />

      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
        <input 
          type="checkbox"
          id="personal_transport"
          checked={formData.preferences.personal_transport_available}
          onChange={(e) => setFormData({...formData, preferences: {...formData.preferences, personal_transport_available: e.target.checked}})}
          className="w-5 h-5 rounded border-white/10 bg-card text-primary focus:ring-primary/50"
        />
        <label htmlFor="personal_transport" className="text-sm font-medium text-white cursor-pointer select-none flex items-center gap-2">
          Own vehicle available? <Zap size={14} className="text-amber-400" />
        </label>
      </div>
    </div>
  );
}

function LocationAutocomplete({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const places = useMapsLibrary('places');
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    if (!places || !containerRef.current) return;

    containerRef.current.innerHTML = '';
    const autocomplete = new (places as any).PlaceAutocompleteElement();
    containerRef.current.appendChild(autocomplete);

    const listener = (e: any) => {
      const place = e.place;
      if (!place) return;
      
      place.fetchFields({ fields: ['displayName', 'formattedAddress'] }).then(() => {
        if (place.formattedAddress) {
          onChangeRef.current(place.formattedAddress);
        } else if (place.displayName) {
          onChangeRef.current(place.displayName);
        }
      });
    };

    autocomplete.addEventListener('gmp-placeselect', listener);

    return () => {
      autocomplete.removeEventListener('gmp-placeselect', listener);
    };
  }, [places]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        gmp-place-autocomplete {
          width: 100%;
        }
        gmp-place-autocomplete input {
          width: 100%;
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: white;
          transition: all 0.2s;
        }
        gmp-place-autocomplete input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.5);
        }
      ` }} />
      {value && <div className="text-xs font-semibold text-primary mb-2">Selected: {value}</div>}
      <div ref={containerRef} className="w-full" />
    </>
  );
}
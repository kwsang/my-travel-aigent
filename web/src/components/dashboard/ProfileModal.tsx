'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, Wallet, Shield, SunMoon, Save, Loader2, Bed, Bus, Zap, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { API_CONFIG, PROFILE_OPTIONS } from '@/config/constants';
import ThemedSelect from './ThemedSelect';
import { ProfileFormData } from '@/types/profile';
import { TravelerProfile } from '@/types';
import { parseProfileData } from '@/utils/profileUtils';

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

  useEffect(() => {
    if (initialData) {
      setFormData(parseProfileData(initialData));
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
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/profile/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        const updatedProfile = await response.json();
        onSave(updatedProfile);
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
                {page === 1 ? "Step 1: Group & Budget" : "Step 2: Style & Transit"}
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
          ) : (
            <ProfilePageTwo formData={formData} setFormData={setFormData} />
          )}
          </div>
        )}

        <div className="mt-10 flex gap-3">
          {page === 1 ? (
            <>
              <button onClick={onClose} className="flex-1 px-6 py-3 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all">Skip</button>
              <button onClick={() => setPage(2)} className="flex-1 bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2">Next <ArrowRight size={18} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setPage(1)} className="px-6 py-3 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all flex items-center gap-2"><ArrowLeft size={18} /> Back</button>
              <button onClick={handleSave} disabled={isSaving} className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2">{isSaving ? "Saving..." : <><Save size={18} /> Save Profile</>}</button>
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
          strokeDasharray={`${page === 1 ? 50 * 2.51 : 100 * 2.51}, 251.2`}
          strokeDashoffset="0"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-primary">{page * 50}%</span>
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
            value={formData.party_size}
            onChange={(e) => setFormData({...formData, party_size: parseInt(e.target.value) || 0})}
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
            disabled={!formData.room_sharing}
            value={formData.people_per_room}
            onChange={(e) => setFormData({...formData, people_per_room: parseInt(e.target.value) || 0})}
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
            value={formData.budget?.total_limit || ''}
            onChange={(e) => setFormData({...formData, budget: { total_limit: parseFloat(e.target.value) || 0, currency: formData.budget?.currency || 'USD' }})}
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

function ProfilePageTwo({ formData, setFormData }: ProfilePageProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
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
          label="Vibe"
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
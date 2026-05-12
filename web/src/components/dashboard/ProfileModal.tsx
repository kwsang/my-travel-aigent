'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, Wallet, Shield, SunMoon, Save, Loader2 } from 'lucide-react';
import { API_CONFIG } from '@/config/constants';

interface ProfileModalProps {
  userId: string;
  initialData?: any;
  onClose: () => void;
  onSave: () => void;
}

export default function ProfileModal({ userId, initialData, onClose, onSave }: ProfileModalProps) {
  const [formData, setFormData] = useState({
    party_size: initialData?.party_size || 1,
    budget: {
      total_limit: initialData?.budget?.total_limit || 0,
      currency: initialData?.budget?.currency || 'USD'
    },
    preferences: {
      risk_tolerance: initialData?.preferences?.risk_tolerance || 'relaxed',
      circadian_preference: initialData?.preferences?.circadian_preference || 'night_owl'
    }
  });
  const [isFetching, setIsFetching] = useState(!initialData);
  const [isSaving, setIsLoading] = useState(false);

  // Fetch latest profile data on mount if not provided by parent
  useEffect(() => {
    const fetchProfile = async () => {
      if (initialData) return;
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/profile/${userId}`);
        if (response.ok) {
          const data = await response.json();
          setFormData({
            party_size: data.party_size || 1,
            budget: data.budget || { total_limit: 0, currency: 'USD' },
            preferences: data.preferences || { risk_tolerance: 'relaxed', circadian_preference: 'night_owl' }
          });
        }
      } catch (e) {
        console.error("ProfileModal: Error loading data", e);
      } finally {
        setIsFetching(false);
      }
    };
    fetchProfile();
  }, [userId, initialData]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/profile/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        localStorage.setItem('travel_profile_set', 'true');
        onSave();
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
          <h2 className="text-2xl font-bold text-white text-white-outline tracking-tight">Traveler Profile</h2>
          <p className="text-sm text-muted-foreground mt-1">Tell us how you like to explore.</p>
        </div>

        {isFetching ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm italic">Loading preferences...</p>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Party Size */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <Users size={14} /> Party Size
            </label>
            <input 
              type="number"
              value={formData.party_size}
              onChange={(e) => setFormData({...formData, party_size: parseInt(e.target.value) || 0})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              placeholder="Number of travelers"
            />
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <Wallet size={14} /> Total Budget
            </label>
            <div className="flex gap-2">
              <input 
                type="number"
                value={formData.budget.total_limit}
                onChange={(e) => setFormData({...formData, budget: {...formData.budget, total_limit: parseInt(e.target.value) || 0}})}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                placeholder="Limit"
              />
              <select 
                value={formData.budget.currency}
                onChange={(e) => setFormData({...formData, budget: {...formData.budget, currency: e.target.value}})}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Preferences */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <Shield size={14} /> Buffer
              </label>
              <select 
                value={formData.preferences.risk_tolerance}
                onChange={(e) => setFormData({...formData, preferences: {...formData.preferences, risk_tolerance: e.target.value as any}})}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="relaxed">Relaxed</option>
                <option value="strict">Strict</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <SunMoon size={14} /> Vibe
              </label>
              <select 
                value={formData.preferences.circadian_preference}
                onChange={(e) => setFormData({...formData, preferences: {...formData.preferences, circadian_preference: e.target.value as any}})}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="night_owl">Night Owl</option>
                <option value="morning_person">Early Bird</option>
              </select>
            </div>
          </div>
          </div>
        )}

        <div className="mt-10 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all"
          >
            Skip
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? "Saving..." : <><Save size={18} /> Save Profile</>}
          </button>
        </div>
      </div>
    </div>
  );
}
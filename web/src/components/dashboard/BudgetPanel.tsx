'use client';

import React from 'react';
import { Event, UserProfile } from '@/types';
import { AlertCircle, ArrowLeftRight, Banknote } from 'lucide-react';
import { BUDGET_CONFIG } from '@/config/constants';

interface BudgetPanelProps {
  segments: Event[];
  budget?: UserProfile['budget'];
  viewMode: 'total' | 'per_person';
  partySize?: number;
  onToggleMode: () => void;
}

export default function BudgetPanel({
  segments,
  budget,
  viewMode,
  partySize = BUDGET_CONFIG.MIN_PARTY_SIZE,
  onToggleMode,
}: BudgetPanelProps) {
  const totalCost = segments.reduce((acc, s) => acc + (s.details.price?.amount || 0), 0);
  const limit = budget?.total_limit || 0;
  const currency = budget?.currency || BUDGET_CONFIG.DEFAULT_CURRENCY;

  const percentage = limit > 0 ? (totalCost / limit) * 100 : 0;
  const isOverThreshold = percentage >= BUDGET_CONFIG.WARNING_THRESHOLD;

  const displayTotal = viewMode === 'total' ? totalCost : totalCost / Math.max(BUDGET_CONFIG.MIN_PARTY_SIZE, partySize);
  const displayLimit = viewMode === 'total' ? limit : limit / Math.max(BUDGET_CONFIG.MIN_PARTY_SIZE, partySize);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMode}
          className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-tight text-muted-foreground transition-colors hover:bg-white/10"
        >
          <ArrowLeftRight className="w-3 h-3" />
          {viewMode === 'total' ? 'Show Per Person' : 'Show Total Trip'}
        </button>
        
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 font-mono text-lg font-bold">
            <Banknote className={`w-5 h-5 mr-1 ${isOverThreshold ? 'text-amber-600' : 'text-slate-400'}`} />
            <span className={`${isOverThreshold ? 'text-amber-600' : 'text-slate-900'} text-white-outline`}>
              {currency} {displayTotal.toLocaleString()}
            </span>
            {limit > 0 && (
              <span className="text-slate-400 font-medium mx-1">/</span>
            )}
            {limit > 0 && (
              <span className="text-slate-500 text-sm">
                {currency} {displayLimit.toLocaleString()}
              </span>
            )}
          </div>
          {limit > 0 && (
            <div className="w-full bg-white/10 rounded-full h-1.5 mt-1 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${isOverThreshold ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {isOverThreshold && (
        <div className="flex animate-in fade-in slide-in-from-top-1 duration-300 items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700 border border-amber-100">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold italic">{BUDGET_CONFIG.WARNING_THRESHOLD}% Budget Warning: Limit Approaching</span>
        </div>
      )}
    </div>
  );
}

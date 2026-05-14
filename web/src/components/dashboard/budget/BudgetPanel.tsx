'use client';

import React from 'react';
import { AlertCircle, ArrowLeftRight, Banknote } from 'lucide-react';
import { BUDGET_CONFIG } from '@/config/constants';
import { useItineraryData } from '@/context/ItineraryContext';
import { calculateBudgetMetrics } from '@/utils/budgetUtils';

export default function BudgetPanel() {
  const { viewMode, setViewMode, segments, budget, partySize, profile } = useItineraryData();

  const onToggleMode = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewMode((v) => (v === 'total' ? 'per_person' : 'total'));
  };

  const {
    rawLimit,
    currency,
    displayTotal,
    displayLimit,
    percentage,
    isOverThreshold
  } = calculateBudgetMetrics({ segments, budget, partySize, profile, viewMode });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 font-mono text-lg font-bold">
            <Banknote className={`w-5 h-5 mr-1 ${isOverThreshold ? 'text-destructive' : 'text-muted-foreground'}`} />
            <span className={`${isOverThreshold ? 'text-destructive' : 'text-foreground'} text-stroke-1`}>
              {currency} {displayTotal.toLocaleString()}
            </span>
            {rawLimit > 0 && (
              <span className="text-slate-400 font-medium mx-1">/</span>
            )}
            {rawLimit > 0 && (
              <span className="text-slate-500 text-sm">
                {currency} {displayLimit.toLocaleString()}
              </span>
            )}
          </div>
          {rawLimit > 0 && (
            <BudgetProgressBar percentage={percentage} isOverThreshold={isOverThreshold} />
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMode}
          className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-tight text-muted-foreground transition-colors hover:bg-white/10"
        >
          <ArrowLeftRight className="w-3 h-3" />
          {viewMode === 'total' ? 'Show Per Person' : 'Show Total Trip'}
        </button>
      </div>

      {isOverThreshold && (
        <BudgetWarningAlert />
      )}
    </div>
  );
}

function BudgetProgressBar({ percentage, isOverThreshold }: { percentage: number, isOverThreshold: boolean }) {
  return (
    <div className="w-full bg-white/10 rounded-full h-1.5 mt-1 overflow-hidden">
      <div 
        className={`h-full transition-all duration-500 ${isOverThreshold ? 'bg-destructive' : 'bg-primary'}`}
        style={{ width: `${Math.min(100, percentage)}%` }}
      />
    </div>
  );
}

function BudgetWarningAlert() {
  return (
    <div className="flex animate-in fade-in slide-in-from-top-1 duration-300 items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-destructive border border-destructive/20">
      <AlertCircle className="w-3.5 h-3.5" />
      <span className="text-xs font-semibold italic">{BUDGET_CONFIG.WARNING_THRESHOLD}% Budget Warning: Limit Approaching</span>
    </div>
  );
}

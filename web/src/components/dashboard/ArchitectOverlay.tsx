'use client';

import React from 'react';

interface ArchitectOverlayProps {
  validationErrors: string[];
  partySize: number;
}

/**
 * ArchitectOverlay
 * Provides floating feedback and conflict notices from the Gemini Architect.
 */
export default function ArchitectOverlay({ validationErrors, partySize }: ArchitectOverlayProps) {
  return (
    <div className="absolute bottom-6 right-6 w-96 rounded-xl border border-slate-200 bg-white shadow-2xl z-50">
      <div className="p-4 font-bold border-b border-slate-100 flex items-center gap-2 text-slate-900">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Gemini Architect
      </div>
      <div className="h-64 overflow-y-auto p-4 text-sm text-slate-600 leading-relaxed">
        {validationErrors.length > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-800 border border-amber-100">
            <strong>Logistics Notice:</strong> I've detected {validationErrors.length} conflict(s) in your current sequence.
          </div>
        )}
        "I have synchronized your visual timeline with the latest research. 
        You can now see the 'Retreat' blocks and budget estimates for your 
        party of {partySize || 1}."
      </div>
    </div>
  );
}
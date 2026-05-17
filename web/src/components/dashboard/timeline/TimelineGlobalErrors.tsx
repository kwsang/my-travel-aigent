import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface TimelineGlobalErrorsProps {
  errors: string[];
}

export default function TimelineGlobalErrors({ errors }: TimelineGlobalErrorsProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 -mt-4 mb-2">
      <div className="flex items-center gap-2 font-bold text-sm">
        <AlertTriangle className="w-4 h-4" />
        <span>Trip Warnings</span>
      </div>
      <ul className="list-disc pl-5 space-y-1 text-xs font-medium opacity-90">
        {errors.map((error: string, idx: number) => (
          <li key={idx}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
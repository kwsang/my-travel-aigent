'use client';

import React, { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
}

/**
 * Toast Component
 * Displays a temporary message at the bottom of the screen.
 * Matches the "Twilight Navigator" glassmorphism theme.
 */
export default function Toast({ message, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card/80 backdrop-blur-xl border border-white/10 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 ring-1 ring-white/5">
        <div className="bg-primary/20 p-1.5 rounded-full">
          <CheckCircle className="text-primary w-5 h-5 shadow-[0_0_8px_rgba(var(--primary),0.3)]" />
        </div>
        <div className="flex flex-col text-left">
          <p className="text-white text-sm font-bold tracking-tight text-white-outline">Success</p>
          <p className="text-muted-foreground text-xs font-medium">{message}</p>
        </div>
        <button 
          onClick={onClose} 
          className="ml-4 text-muted-foreground hover:text-white transition-colors p-1 hover:bg-white/5 rounded-lg"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
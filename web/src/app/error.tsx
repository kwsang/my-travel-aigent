'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service if you have one
    console.error('Global application error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background text-foreground p-6 text-center">
      <div className="bg-card/80 backdrop-blur-xl border border-destructive/20 rounded-3xl p-8 max-w-md shadow-2xl flex flex-col items-center ring-1 ring-white/5">
        <AlertTriangle className="w-12 h-12 mb-4 text-destructive opacity-80" />
        <h2 className="text-lg font-bold mb-2 uppercase tracking-widest text-destructive">System Error</h2>
        <p className="text-sm opacity-80 mb-8 max-w-xs text-muted-foreground">
          {error.message || "An unexpected error occurred while loading the application."}
        </p>
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-5 py-2.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-xl transition-all text-sm font-bold shadow-sm active:scale-95"
        >
          <RefreshCcw className="w-4 h-4" />
          Try to Recover
        </button>
      </div>
    </div>
  );
}
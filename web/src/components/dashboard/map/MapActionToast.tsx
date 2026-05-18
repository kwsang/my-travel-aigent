import React from 'react';

interface MapActionToastProps {
  actionToast: { title: string; desc: string } | null;
}

export default function MapActionToast({ actionToast }: MapActionToastProps) {
  if (!actionToast) return null;

  return (
    <div key={actionToast.title + actionToast.desc} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300">
      <div className="flex items-center gap-3 bg-card border border-white/10 px-4 py-3 rounded-xl shadow-2xl text-foreground">
        <div className="relative flex h-4 w-4 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </div>
        <div className="flex flex-col pr-2">
          <span className="text-sm font-semibold leading-tight">{actionToast.title}</span>
          {actionToast.desc && <span className="text-xs text-muted-foreground leading-tight mt-0.5">{actionToast.desc}</span>}
        </div>
      </div>
    </div>
  );
}
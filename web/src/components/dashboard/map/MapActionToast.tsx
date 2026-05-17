import React from 'react';

interface MapActionToastProps {
  actionToast: { title: string; desc: string } | null;
}

export default function MapActionToast({ actionToast }: MapActionToastProps) {
  if (!actionToast) return null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300">
      <div className="flex items-center gap-3 bg-foreground text-background px-4 py-3 rounded-full shadow-2xl">
        <div className="relative flex h-3 w-3 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </div>
        <div className="flex flex-col pr-2">
          <span className="text-sm font-bold leading-none mb-1">{actionToast.title}</span>
          <span className="text-[10px] font-medium opacity-80 leading-none">{actionToast.desc}</span>
        </div>
      </div>
    </div>
  );
}
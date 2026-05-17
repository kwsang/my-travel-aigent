import React from 'react';
import { X } from 'lucide-react';

interface ChatHeaderProps {
  onClose: () => void;
}

export default function ChatHeader({ onClose }: ChatHeaderProps) {
  return (
    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
        <h3 className="font-bold text-foreground text-sm tracking-wide">Travel AIgent</h3>
      </div>
      <button onClick={onClose} className="text-white hover:opacity-80 transition-opacity" title="Close Chat">
        <X size={18} />
      </button>
    </div>
  );
}
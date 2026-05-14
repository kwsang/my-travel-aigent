import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface RenameAlertModalProps {
  onDiscard: () => void;
  onKeepEditing: () => void;
}

export default function RenameAlertModal({ onDiscard, onKeepEditing }: RenameAlertModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm p-6 relative ring-1 ring-white/5 flex flex-col items-center text-center">
        <div className="bg-amber-500/20 p-3 rounded-full mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Blank Trip Name</h3>
        <p className="text-sm text-muted-foreground mb-6">
          A trip name cannot be empty. Please enter a valid name or discard changes.
        </p>
        <div className="flex gap-3 w-full">
          <button 
            onClick={onDiscard}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all"
          >
            Discard
          </button>
          <button 
            onClick={onKeepEditing}
            className="flex-1 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Keep Editing
          </button>
        </div>
      </div>
    </div>
  );
}
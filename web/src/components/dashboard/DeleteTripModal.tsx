import React from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteTripModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteTripModal({ onClose, onConfirm }: DeleteTripModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm p-6 relative ring-1 ring-white/5 flex flex-col items-center text-center">
        <div className="bg-destructive/20 p-3 rounded-full mb-4">
          <Trash2 className="w-6 h-6 text-destructive" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Delete Trip?</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Are you sure you want to delete this trip and its history? This action cannot be undone.
        </p>
        <div className="flex gap-3 w-full">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 bg-destructive text-destructive-foreground px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-destructive/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
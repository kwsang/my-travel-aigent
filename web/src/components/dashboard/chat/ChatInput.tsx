import React from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onSend: () => void;
}

export default function ChatInput({ input, setInput, isLoading, onSend }: ChatInputProps) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSend(); }} className="p-4 border-t border-white/10 bg-black/20 flex gap-2 shrink-0">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Adjust itinerary..."
        className="flex-1 text-sm bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading || !input.trim()} className="bg-primary text-primary-foreground p-2 rounded-xl hover:brightness-110 disabled:opacity-30 transition-all active:scale-95 shadow-lg shadow-primary/20">
        <Send size={18} />
      </button>
    </form>
  );
}
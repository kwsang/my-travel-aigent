'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import { API_CONFIG } from '@/config/constants';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

interface ChatInterfaceProps {
  sessionId: string;
  userId?: string;
  onMessageReceived?: () => void;
}

/**
 * ChatInterface Component
 * Replaces the ArchitectOverlay to provide direct conversation with the Gemini agent.
 * Receives a session ID from the parent dashboard to sync data.
 */
export default function ChatInterface({ sessionId, userId, onMessageReceived }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'agent', 
      content: "Hello! I'm your Travel AIgent. I can help you refine this itinerary or suggest new experiences. What's on your mind?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch history when session changes
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/chat/${sessionId}?user_id=${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
          } else {
            // Default greeting for new sessions
            setMessages([{ 
              role: 'agent', 
              content: "Hello! I'm your Travel AIgent. I can help you refine this itinerary or suggest new experiences. What's on your mind?" 
            }]);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [sessionId, userId]);

  // Auto-scroll to bottom on new messages or loading state change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          session_id: sessionId,
          user_id: userId,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'agent', content: data.response }]);

      // Trigger refresh of the itinerary in the parent dashboard
      if (onMessageReceived) {
        onMessageReceived();
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'agent', content: "Sorry, I lost my connection to the server. Please check if the API is running." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute bottom-6 right-6 w-96 h-[500px] flex flex-col bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 ring-1 ring-white/5">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2 bg-white/5 shrink-0">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
        <h3 className="font-bold text-foreground text-sm tracking-wide">Travel AIgent</h3>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-transparent scroll-smooth">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === 'user' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-foreground'
              }`}>
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className={`p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-primary text-primary-foreground rounded-tr-none font-medium' 
                  : 'bg-white/5 border border-white/10 text-foreground rounded-tl-none backdrop-blur-sm'
              }`}>
                {msg.role === 'agent' ? (
                  <div className="markdown-content">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2 items-center text-muted-foreground ml-1">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs italic">Thinking...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 border-t border-white/10 bg-black/20 flex gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Adjust itinerary..."
          className="flex-1 text-sm bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-white-outline placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()} className="bg-primary text-primary-foreground p-2 rounded-xl hover:brightness-110 disabled:opacity-30 transition-all active:scale-95 shadow-lg shadow-primary/20">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, Bot, Loader2, MessageSquare, X, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import { API_CONFIG } from '@/config/constants';
import { ChatMessage } from '@/types'; // Import ChatMessage from shared types
import { useItineraryData } from '@/context/ItineraryContext';

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
  const { profile, itinerary, setItinerary, setProfile } = useItineraryData() as any;
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: 'agent', 
      content: "Hello! I'm your Travel AIgent. Let's build your itinerary from scratch! Where would you like to go, and what kind of experiences are you looking for?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);

  // Fetch history when session changes
  useEffect(() => {
    if (!sessionId || !userId) return;

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
              content: "Hello! I'm your Travel AIgent. Let's build your itinerary from scratch! Where would you like to go, and what kind of experiences are you looking for?" 
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

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Show button if user scrolls up more than 50px from bottom
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 50);
  };

  // Spacebar to scroll down when hovering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isHovered) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          scrollToBottom();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHovered]);

  const sendMessage = useCallback(async (userMessage: string, overrideItinerary?: any, overrideProfile?: any) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

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
          user_profile: overrideProfile || profile,
          itinerary: overrideItinerary || itinerary,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'agent', content: data.response }]);

      // Immediately update the dashboard with the agent's latest state
      if (data.itinerary && setItinerary) {
        // Sanitize incoming itinerary to ensure arrays are not null
        setItinerary({
          ...data.itinerary,
          suggested_accommodations: data.itinerary.suggested_accommodations || [],
          suggested_activities: data.itinerary.suggested_activities || [],
          events: data.itinerary.events || [],
        });
      }
      if (data.user_profile && setProfile) {
        setProfile(data.user_profile);
      }

      // Trigger refresh of the itinerary in the parent dashboard
      if (onMessageReceived) {
        onMessageReceived();
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'agent', content: "Sorry, I lost my connection to the server. Please check if the API is running." }]);
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
    }
  }, [sessionId, userId, profile, itinerary, onMessageReceived]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    sendMessage(msg);
  };

  // Listen for custom destination events from the map
  useEffect(() => {
    const handleSetDestination = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const destination = customEvent.detail;
      
      if (destination && !isLoading) {
        sendMessage(`I'd like to plan a trip to ${destination}. Please suggest some accommodations.`, { ...itinerary, destination });
      }
    };

    window.addEventListener('travel_aigent_set_destination', handleSetDestination);
    return () => window.removeEventListener('travel_aigent_set_destination', handleSetDestination);
  }, [sendMessage, isLoading, itinerary]);

  // Listen for accommodation selection events from the map
  useEffect(() => {
    const handleSelectAccommodation = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const place = customEvent.detail;
      
      if (place && !isLoading) {
        const placeName = place.details?.name || place.displayName?.text || place.name || 'that accommodation';
        
        // Optimistically clear the suggestions from the map
        const updatedItinerary = { ...itinerary, suggested_accommodations: [] };
        if (setItinerary) setItinerary(updatedItinerary);
        
        sendMessage(`Great, please select "${placeName}" as my accommodation and continue planning. Please suggest some activities.`, updatedItinerary);
      }
    };

    window.addEventListener('travel_aigent_select_accommodation', handleSelectAccommodation);
    return () => window.removeEventListener('travel_aigent_select_accommodation', handleSelectAccommodation);
  }, [sendMessage, isLoading, itinerary, setItinerary]);

  // Listen for activity selection events from the map
  useEffect(() => {
    const handleSelectActivity = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const place = customEvent.detail;
      
      if (place && !isLoading) {
        const placeName = place.details?.name || place.displayName?.text || place.name || 'that option';
        
        // Optimistically clear the suggestions from the map
        const updatedItinerary = { ...itinerary, suggested_activities: [] };
        if (setItinerary) setItinerary(updatedItinerary);
        
        sendMessage(`Awesome, please add "${placeName}" to my itinerary.`, updatedItinerary);
      }
    };

    window.addEventListener('travel_aigent_select_activity', handleSelectActivity);
    return () => window.removeEventListener('travel_aigent_select_activity', handleSelectActivity);
  }, [sendMessage, isLoading, itinerary, setItinerary]);

  // Listen for profile update events from the profile modal
  useEffect(() => {
    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const updatedProfile = customEvent.detail;
      
      if (updatedProfile && !isLoading) {
        sendMessage(`I've updated my traveler profile and budget constraints. Please review and adjust the itinerary if needed.`, undefined, updatedProfile);
      }
    };

    window.addEventListener('travel_aigent_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('travel_aigent_profile_updated', handleProfileUpdated);
  }, [sendMessage, isLoading]);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`absolute bottom-6 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 z-50 ring-1 ring-white/10 ${isOpen ? 'opacity-0 scale-50 invisible pointer-events-none' : 'opacity-100 scale-100 visible'}`}
        title="Open Chat"
      >
        <MessageSquare size={24} />
      </button>

    <div 
      className={`absolute bottom-6 right-6 w-96 h-[500px] flex flex-col bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 ring-1 ring-white/5 transition-all duration-300 origin-bottom-right ${isOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible pointer-events-none'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
          <h3 className="font-bold text-foreground text-sm tracking-wide">Travel AIgent</h3>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white hover:opacity-80 transition-opacity" title="Close Chat">
          <X size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 bg-transparent scroll-smooth [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40">
        {messages.map((m: ChatMessage, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                m.role === 'user' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-foreground'
              }`}>
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className={`p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-primary text-primary-foreground rounded-tr-none font-medium' 
                  : 'bg-white/5 border border-white/10 text-foreground rounded-tl-none backdrop-blur-sm'
              }`}>
                {m.role === 'agent' ? (
                  <div className="markdown-content">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : m.content}
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

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-6 p-2 bg-primary/90 text-primary-foreground rounded-full shadow-lg hover:bg-primary transition-all z-10 animate-in fade-in zoom-in-95"
          title="Scroll to bottom (Space)"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Input Area */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 border-t border-white/10 bg-black/20 flex gap-2 shrink-0">
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
    </div>
    </>
  );
}
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, MessageSquare, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { API_CONFIG } from '@/config/constants';
import { ChatMessage } from '@/types'; // Import ChatMessage from shared types
import { useItineraryData } from '@/context/ItineraryContext';
import { useChatEvents } from '@/hooks/useChatEvents';
import ChatMessageItem from './ChatMessageItem';
import ChatInput from './ChatInput';
import ChatHeader from './ChatHeader';

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
  const { profile, itinerary, setItinerary, setProfile } = useItineraryData();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: 'agent', 
      content: "Hello! I'm your Travel AIgent. Let's build your itinerary from scratch! Where would you like to go, and what kind of experiences are you looking for?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  const isMessagesHoveredRef = useRef(false);
  const prevMessagesLengthRef = useRef(messages.length);

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
    if (!scrollRef.current) return;
    
    const isAtBottom = scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight <= 50;
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    const isHistoryLoad = prevMessagesLengthRef.current <= 1 && messages.length > 1;
    
    if (isHistoryLoad) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else if (isNewMessage) {
      if (isMessagesHoveredRef.current || !isAtBottom) {
        setHasUnreadMessages(true);
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    } else if (!isMessagesHoveredRef.current && isAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages, isLoading]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setHasUnreadMessages(false);
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Show button if user scrolls up more than 50px from bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 50;
    setShowScrollButton(!isAtBottom);
    if (isAtBottom && hasUnreadMessages) {
      setHasUnreadMessages(false);
    }
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

  const sendMessage = useCallback(async (userMessage: string, overrideItinerary?: any, overrideProfile?: any, displayMessage?: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    window.dispatchEvent(new CustomEvent('travel_aigent_generation_start'));

    // Add user message to UI (using the friendly display message if provided)
    const contentToShow = displayMessage !== undefined ? displayMessage : userMessage;
    if (contentToShow) {
      setMessages(prev => [...prev, { role: 'user', content: contentToShow }]);
    }
    setIsLoading(true);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          session_id: sessionId,
          user_id: userId,
          traveler_profile: overrideProfile || profile,
          itinerary: overrideItinerary || itinerary,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream not supported');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.type === 'update') {
              if (data.itinerary && setItinerary) {
                setItinerary((prev: any) => ({
                  ...prev,
                  ...data.itinerary,
                  events: data.itinerary.events || [],
                }));
              }
            } else if (data.type === 'complete') {
              const agentMessage = data.response || "I'm sorry, but I didn't generate a response. Please try asking again!";
              setMessages(prev => [...prev, { role: 'agent', content: agentMessage }]);

              if (data.itinerary && setItinerary) {
                setItinerary((prev: any) => ({
                  ...prev,
                  ...data.itinerary,
                  events: data.itinerary.events || [],
                }));
              }
              if (data.traveler_profile && setProfile) {
                setProfile(data.traveler_profile);
              }
              if (onMessageReceived) {
                onMessageReceived();
              }
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (err) {
            console.error('Error parsing stream chunk:', err);
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'agent', content: "Sorry, I lost my connection to the server. Please check if the API is running." }]);
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
      window.dispatchEvent(new CustomEvent('travel_aigent_generation_end'));
    }
  }, [sessionId, userId, profile, itinerary, onMessageReceived]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    sendMessage(msg);
    setTimeout(scrollToBottom, 100);
  };

  useChatEvents(sendMessage, isLoading, itinerary);

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
      <ChatHeader onClose={() => setIsOpen(false)} />

      {/* Messages Area */}
      <div 
        ref={scrollRef} 
        onScroll={handleScroll} 
        onMouseEnter={() => { isMessagesHoveredRef.current = true; }}
        onMouseLeave={() => { isMessagesHoveredRef.current = false; }}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-transparent scroll-smooth [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40"
      >
        {messages.map((m: ChatMessage, i) => (
          <ChatMessageItem key={i} message={m} />
        ))}
        {isLoading && (
          <div className="flex gap-2 items-center text-muted-foreground ml-1">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs italic">Thinking...</span>
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {(showScrollButton || hasUnreadMessages) && (
        <button
          onClick={scrollToBottom}
          className={`absolute bottom-20 right-6 flex items-center gap-1 p-2 ${hasUnreadMessages ? 'pr-4' : ''} bg-primary/90 text-primary-foreground rounded-full shadow-lg hover:bg-primary transition-all z-10 animate-in fade-in zoom-in-95`}
          title="Scroll to bottom (Space)"
        >
          <ChevronDown size={18} />
          {hasUnreadMessages && <span className="text-xs font-semibold">New messages</span>}
        </button>
      )}

      {/* Input Area */}
      <ChatInput
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        onSend={handleSend}
      />
    </div>
    </>
  );
}
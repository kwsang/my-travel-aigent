import { useState, useRef, useEffect } from 'react';
import { ChatRequest, ChatResponse } from '@/types';
import { v4 as uuidv4 } from 'uuid'; // You'll need to install this package: npm install uuid @types/uuid

export function useChat() {
  // Initialize sessionId directly from localStorage or generate a new one
  const [sessionId, setSessionId] = useState<string>(() => {
    // Check if we are running on the client side
    if (typeof window === 'undefined') return '';

    let storedSessionId = window.localStorage.getItem('chat_session_id');
    if (!storedSessionId) {
      storedSessionId = uuidv4();
      if (process.env.NODE_ENV === 'development') {
        console.log("Generated NEW session_id:", storedSessionId);
      }
      window.localStorage.setItem('chat_session_id', storedSessionId);
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log("Using EXISTING session_id from localStorage:", storedSessionId);
      }
    }
    return storedSessionId;
  });

  const [messages, setMessages] = useState<ChatResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Function to scroll to the bottom of the chat window
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Automatically trigger scroll whenever the messages array updates
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId) return; // Ensure sessionId is available

    // Add user message to UI immediately
    const userMsg: ChatResponse = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Helper function to perform the actual fetch call
    const performRequest = async (id: string) => {
      // Ensure baseUrl is absolute and trailing-slash safe
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';
      const payload: ChatRequest = {
        user_id: "user_savannah_test",
        session_id: id,
        message: text,
      };
      if (process.env.NODE_ENV === 'development') {
        console.log("Sending message with session_id:", id);
      }
      return fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    };

    try {
      let response = await performRequest(sessionId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const detail = errorBody.detail || "";

        if (response.status === 404 || detail.includes("Session not found") || detail.includes("Internal Agent Error")) {
          console.warn("Session invalid. Retrying with a fresh session ID...");
          const newId = uuidv4();
          window.localStorage.setItem('chat_session_id', newId);
          setSessionId(newId);
          
          // Automatic Retry
          response = await performRequest(newId);
          if (!response.ok) {
            const retryError = await response.json().catch(() => ({}));
            throw new Error(retryError.detail || 'Agent failed even after session reset');
          }
        } else {
          throw new Error(errorBody.detail || 'Network response was not ok');
        }
      }
      
      const data = await response.json();
      const rawText = data.response || "";
      
      // Split the response by double newlines to create separate message bubbles for each paragraph
      const segments = rawText.split(/\n\n+/).filter((s: string) => s.trim());

      if (segments.length > 0) {
        const modelMessages: ChatResponse[] = segments.map((segment: string, index: number) => ({
          role: 'model',
          text: segment.trim(),
          // Apply the conflict flag only to the last segment to avoid duplicate UI warnings
          is_conflict: index === segments.length - 1 ? data.is_conflict : false
        }));
        setMessages((prev) => [...prev, ...modelMessages]);
      } else {
        // Fallback for empty responses that might still contain conflict state updates
        setMessages((prev) => [...prev, { 
          role: 'model', 
          text: '', 
          is_conflict: data.is_conflict 
        }]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not connect to the agent brain.";
      console.error("Failed to send message for session_id:", sessionId, error);
      setMessages((prev) => [
        ...prev, 
        { role: 'system', text: `Error: ${errorMessage}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading, sessionId, messagesEndRef }; // Export sessionId if needed elsewhere
}
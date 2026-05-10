import { useState } from 'react';
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
      console.log("Generated NEW session_id:", storedSessionId);
      window.localStorage.setItem('chat_session_id', storedSessionId);
    } else {
      console.log("Using EXISTING session_id from localStorage:", storedSessionId);
    }
    return storedSessionId;
  });

  const [messages, setMessages] = useState<ChatResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId) return; // Ensure sessionId is available

    // Add user message to UI immediately
    const userMsg: ChatResponse = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Helper function to perform the actual fetch call
    const performRequest = async (id: string) => {
      const payload: ChatRequest = {
        user_id: "user_savannah_test",
        session_id: id,
        message: text,
      };
      console.log("Sending message with session_id:", id);
      return fetch('/api/chat', {
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

      const data: ChatResponse[] = await response.json();
      
      // Append all parts returned by the agent
      setMessages((prev) => [...prev, ...data]);
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

  return { messages, sendMessage, isLoading, sessionId }; // Export sessionId if needed elsewhere
}
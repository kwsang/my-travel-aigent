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

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || "";

        for (const line of parts) {
          if (!line.trim()) continue;
          try {
            const chunk: ChatResponse = JSON.parse(line);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              // If the last message was from the model, append the new text/thought to it
              if (last && last.role === 'model' && chunk.role === 'model') {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    text: (last.text || '') + (chunk.text || ''),
                    thought: (last.thought || '') + (chunk.thought || '')
                  }
                ];
              }
              // Otherwise, add a new message entry
              return [...prev, chunk];
            });
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
          }
        }
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

  return { messages, sendMessage, isLoading, sessionId }; // Export sessionId if needed elsewhere
}
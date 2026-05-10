import { useState } from 'react';
import { ChatRequest, ChatResponse } from '@/types';

export function useChat() {
  const [messages, setMessages] = useState<ChatResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Add user message to UI immediately
    const userMsg: ChatResponse = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const payload: ChatRequest = {
        user_id: "user_savannah_test",
        session_id: "session_web_001",
        message: text,
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data: ChatResponse[] = await response.json();
      
      // Append all parts returned by the agent
      setMessages((prev) => [...prev, ...data]);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev, 
        { role: 'system', text: "Error: Could not connect to the agent brain." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
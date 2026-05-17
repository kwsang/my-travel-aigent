import React from 'react';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '@/types';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export default function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isUser ? 'bg-primary/20 text-primary' : 'bg-white/10 text-foreground'
        }`}>
          {isUser ? <User size={14} /> : <Bot size={14} />}
        </div>
        <div className={`p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${
          isUser 
            ? 'bg-primary text-primary-foreground rounded-tr-none font-medium' 
            : 'bg-white/5 border border-white/10 text-foreground rounded-tl-none backdrop-blur-sm'
        }`}>
          {message.role === 'agent' ? (
            <div className="markdown-content">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : message.content}
        </div>
      </div>
    </div>
  );
}
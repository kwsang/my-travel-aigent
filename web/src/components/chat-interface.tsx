'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/use-chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '@/types';

export function ChatInterface() {
  const { messages, sendMessage, isLoading } = useChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to the bottom anchor whenever content changes
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <Card className="w-full h-[600px] flex flex-col shadow-lg border-zinc-200 dark:border-zinc-800">
      <CardHeader className="border-b bg-white dark:bg-zinc-900">
        <CardTitle className="flex items-center gap-2 text-xl font-bold">
          <Bot className="w-6 h-6 text-primary" />
          My Travel AIgent Brain
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-4 bg-zinc-50/50 dark:bg-zinc-950/50">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            {(messages as any[]).map((m: ChatMessage, i) => (
              <div
                key={i}
                className={`flex gap-3 ${
                  m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className={`p-3 rounded-2xl max-w-[80%] ${
                  m.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-none' 
                    : m.is_conflict
                      ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-tl-none shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-tl-none shadow-sm'
                }`}>
                  {m.is_conflict && (
                    <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400 font-bold text-xs uppercase tracking-tight">
                      <AlertTriangle className="w-4 h-4" />
                      Conflict Detected
                    </div>
                  )}
                  <div className="text-base leading-relaxed prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-sm md:prose-base">
                    <ReactMarkdown>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                  {m.thought && (
                    <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <p className="text-xs uppercase tracking-wider font-semibold opacity-40 mb-1">Agent Thought</p>
                      <p className="text-sm italic opacity-70 whitespace-pre-wrap font-mono">{m.thought}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-2xl rounded-tl-none animate-pulse text-base">
                  Architect is thinking...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t bg-white dark:bg-zinc-900">
        <div className="flex w-full gap-2">
          <Input 
            placeholder="Plan a trip to Savannah..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="bg-zinc-50 dark:bg-zinc-950"
          />
          <Button size="icon" onClick={handleSend} disabled={isLoading} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
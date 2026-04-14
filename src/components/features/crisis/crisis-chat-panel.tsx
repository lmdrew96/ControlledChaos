"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import type { CrisisMessage } from "@/types";

interface Props {
  planId: string;
  /** Optional AI-generated questions to surface as conversation starters */
  questions?: string[];
}

export function CrisisChatPanel({ planId, questions }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<CrisisMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Load chat history when panel first opens
  const loadMessages = useCallback(async () => {
    if (hasLoaded) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/crisis/${planId}/chat`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {
      // Silent fail — empty chat is fine
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [planId, hasLoaded]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    loadMessages();
  }, [loadMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending) return;

      setIsSending(true);
      setInput("");

      // Optimistic user message
      const tempUserMsg: CrisisMessage = {
        id: `temp-${Date.now()}`,
        crisisPlanId: planId,
        role: "user",
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const res = await fetch(`/api/crisis/${planId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        });

        if (!res.ok) throw new Error();
        const data = await res.json();

        // Replace temp message with real one and add assistant response
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          data.userMessage,
          data.assistantMessage,
        ]);
      } catch {
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        setInput(text); // Restore input
      } finally {
        setIsSending(false);
      }
    },
    [planId, isSending]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  // Quick question buttons
  const handleQuickQuestion = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage]
  );

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleOpen}
      >
        <MessageCircle className="h-4 w-4" />
        Talk to me
        {questions && questions.length > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {questions.length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Card className="border-blue-500/30">
      <CardContent className="p-0">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Crisis Chat</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Messages area */}
        <div className="max-h-64 min-h-[120px] overflow-y-auto px-4 py-3 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Ask me anything about your crisis plan. I can help you get unstuck, adjust the plan, or just think through the next step.
              </p>
              {/* Quick question buttons from AI-generated questions */}
              {questions && questions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Quick questions:</p>
                  {questions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickQuestion(q)}
                      className="block w-full rounded-md border border-border px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {msg.content}
            </div>
          ))}

          {isSending && (
            <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} className="border-t px-3 py-2">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you need help with?"
              rows={1}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              disabled={isSending}
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={!input.trim() || isSending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

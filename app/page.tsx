"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "⚠️ Error: Could not reach the AI server.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-b from-background to-muted flex justify-center">
      <div className="w-full max-w-3xl">
        <Card className="shadow-2xl border border-border/50">
          <CardHeader className="border-b bg-card/90 backdrop-blur">
            <CardTitle className="text-xl font-bold">
              Household Sustainability AI Assistant 🏡
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ask me anything about Household Sustainability
            </p>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[600px] p-4">
              <div className="space-y-4">
                {messages.map((m) => (
                  <ChatBubble key={m.id} message={m} />
                ))}

                {isLoading && (
                  <div className="flex gap-2 items-center text-muted-foreground text-sm px-3">
                    <div className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-pulse"></div>
                    <span>AI is typing…</span>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <form
              onSubmit={sendMessage}
              className="border-t p-3 bg-card/80 backdrop-blur flex gap-2">
              <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); 
      sendMessage(e);     
    }
  }}
  placeholder="Ask me something..."
  className="min-h-[55px] max-h-[120px] resize-none flex-1"
/>

              <Button type="submit" disabled={isLoading} className="h-[55px]">
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex flex-col max-w-[80%] rounded-xl p-3 shadow-sm",
        isUser
          ? "ml-auto bg-blue-600 text-white"
          : "mr-auto bg-secondary text-secondary-foreground"
      )}>
      <div className="whitespace-pre-wrap">{message.content}</div>

    </div>
  );
}

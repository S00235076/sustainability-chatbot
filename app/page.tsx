"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Upload, FileText, Trash2, X, Moon, Sun } from "lucide-react";

type Source = {
  id: number;
  filename: string;
  excerpt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: Source[];
};

type Document = {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
  chunk_count: number;
};

export default function ChatPage() {
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("chatSessionId");
      if (!id) {
        id = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        localStorage.setItem("chatSessionId", id);
      }
      return id;
    }
    return "";
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (sessionId) {
      fetchDocuments();
    }
  }, [sessionId]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = savedTheme ? savedTheme === "dark" : prefersDark;

    document.documentElement.classList.toggle("dark", shouldUseDark);
    setIsDarkMode(shouldUseDark);
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/documents?sessionId=${sessionId}`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        // Refresh documents list
        await fetchDocuments();
        
        // Show success message in chat
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `✅ Successfully uploaded "${data.filename}"! It has been processed into ${data.chunks} chunks. You can now ask me questions about this document.`,
            timestamp: Date.now(),
          },
        ]);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `❌ Error uploading file: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const deleteDocument = async (docId: number) => {
    try {
      await fetch(`/api/documents?sessionId=${sessionId}&documentId=${docId}`, {
        method: "DELETE",
      });
      await fetchDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

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
          sessionId,
        }),
      });

      const data = await response.json();

      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "",
        timestamp: Date.now(),
        sources: data.sources || [],
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

  const toggleDarkMode = () => {
    const nextIsDark = !isDarkMode;
    setIsDarkMode(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    localStorage.setItem("theme", nextIsDark ? "dark" : "light");
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-b from-background to-muted flex justify-center">
      <div className="w-full max-w-4xl flex gap-4">
        {/* Main Chat */}
        <Card className="flex-1 shadow-2xl border border-border/50">
          <CardHeader className="border-b bg-card/90 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold">
                  AI Document Assistant 📚
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Upload files and ask questions about them
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleDarkMode}
                  className="gap-2">
                  {isDarkMode ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  {isDarkMode ? "Light" : "Dark"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDocuments(!showDocuments)}
                  className="gap-2">
                  <FileText className="h-4 w-4" />
                  {documents.length} Files
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-2">
                  <Upload className="h-4 w-4" />
                  {isUploading ? "Uploading..." : "Upload"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.html,.htm"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[600px] p-4">
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">
                      Upload documents to get started
                    </p>
                    <p className="text-sm mt-2">
                      Supported: .txt, .md, .html files
                    </p>
                  </div>
                )}

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
                placeholder="Ask about your documents..."
                className="min-h-[55px] max-h-[120px] resize-none flex-1"
                disabled={documents.length === 0}
              />
              <Button type="submit" disabled={isLoading || documents.length === 0} className="h-[55px]">
                Send
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Documents Sidebar */}
        {showDocuments && (
          <Card className="w-80 shadow-2xl border border-border/50">
            <CardHeader className="border-b bg-card/90 backdrop-blur flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Your Documents</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDocuments(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {documents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No documents uploaded yet
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {doc.filename}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {(doc.file_size / 1024).toFixed(1)} KB •{" "}
                              {doc.chunk_count} chunks
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDocument(doc.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex flex-col max-w-[80%] rounded-xl p-3 shadow-sm",
          isUser
            ? "ml-auto bg-blue-600 text-white"
            : "mr-auto bg-secondary text-secondary-foreground"
        )}>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>

      {!isUser && message.sources && message.sources.length > 0 && (
        <div className="mr-auto max-w-[80%] ml-2">
          <button
            onClick={() => setShowSources(!showSources)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <span>📚</span>
            <span className="underline">
              {showSources ? "Hide" : "Show"} {message.sources.length} source(s)
            </span>
          </button>

          {showSources && (
            <div className="space-y-2">
              {message.sources.map((source) => (
                <div
                  key={source.id}
                  className="bg-muted/50 rounded-lg p-3 text-xs border border-border/50">
                  <div className="font-semibold text-foreground mb-2">
                    [Source {source.id}] {source.filename}
                  </div>
                  <div className="text-muted-foreground italic border-l-2 border-border pl-3 mt-2">
                    {source.excerpt.substring(0, 200)}
                    {source.excerpt.length > 200 ? "..." : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

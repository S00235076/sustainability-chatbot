"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Upload, FileText, Trash2, X, Leaf, Heart, DollarSign, Plus, Eye, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";

type Source = {
  id: number;
  filename: string;
  excerpt: string;
  category: string;
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
  category: string;
  file_type: string;
  file_size: number;
  created_at: string;
  chunk_count: number;
};

type Category = {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  isCustom?: boolean;
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: "sustainability", name: "Sustainability", icon: <Leaf className="h-4 w-4" />, color: "bg-green-500" },
  { id: "health", name: "Health & Wellness", icon: <Heart className="h-4 w-4" />, color: "bg-red-500" },
  { id: "finance", name: "Finance & Budgeting", icon: <DollarSign className="h-4 w-4" />, color: "bg-blue-500" },
];

const CUSTOM_CATEGORY_COLORS = [
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-yellow-500",
  "bg-teal-500",
];

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

  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState("sustainability");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [viewingDocument, setViewingDocument] = useState<{ id: number; filename: string; content: string; file_type: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (sessionId) {
      fetchDocuments();
      fetchCategoryCounts();
      loadCustomCategories();
    }
  }, [sessionId, activeCategory]);

  const loadCustomCategories = async () => {
    try {
      // Load locally stored custom categories (persists before docs are uploaded)
      const storedRaw = localStorage.getItem(`customCategories_${sessionId}`);
      const stored: Array<{ id: string; name: string }> = storedRaw ? JSON.parse(storedRaw) : [];

      // Also fetch from DB to pick up categories from other sessions / after reload
      const response = await fetch(`/api/categories?sessionId=${sessionId}`);
      const data = await response.json();

      const storedIds = new Set(stored.map((c) => c.id));
      const dbExtra = (data.categories || [])
        .filter((cat: any) => !DEFAULT_CATEGORIES.find((dc) => dc.id === cat.category) && !storedIds.has(cat.category))
        .map((cat: any) => ({
          id: cat.category,
          name: cat.category.split('-').map((word: string) =>
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' '),
        }));

      const allCustom = [...stored, ...dbExtra];

      const customCats: Category[] = allCustom.map((cat, index) => ({
        id: cat.id,
        name: cat.name,
        icon: <FileText className="h-4 w-4" />,
        color: CUSTOM_CATEGORY_COLORS[index % CUSTOM_CATEGORY_COLORS.length],
        isCustom: true,
      }));

      setCategories([...DEFAULT_CATEGORIES, ...customCats]);
    } catch (error) {
      console.error("Error loading custom categories:", error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/documents?sessionId=${sessionId}&category=${activeCategory}`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const fetchCategoryCounts = async () => {
    try {
      const response = await fetch(`/api/documents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json();
      setCategoryCounts(data.categories || {});
    } catch (error) {
      console.error("Error fetching category counts:", error);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionId, 
          categoryName: newCategoryName 
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Persist to localStorage so it survives reloads and useEffect re-runs
        const storedRaw = localStorage.getItem(`customCategories_${sessionId}`);
        const stored: Array<{ id: string; name: string }> = storedRaw ? JSON.parse(storedRaw) : [];
        if (!stored.find((c) => c.id === data.categoryId)) {
          stored.push({ id: data.categoryId, name: newCategoryName });
          localStorage.setItem(`customCategories_${sessionId}`, JSON.stringify(stored));
        }

        const newCategory: Category = {
          id: data.categoryId,
          name: newCategoryName,
          icon: <FileText className="h-4 w-4" />,
          color: CUSTOM_CATEGORY_COLORS[categories.length % CUSTOM_CATEGORY_COLORS.length],
          isCustom: true
        };

        setCategories([...categories, newCategory]);
        setActiveCategory(data.categoryId);
        setShowAddCategory(false);
        setNewCategoryName("");
      }
    } catch (error) {
      console.error("Error adding category:", error);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await fetch(`/api/categories?sessionId=${sessionId}&categoryId=${categoryId}`, {
        method: "DELETE",
      });

      // Remove from localStorage
      const storedRaw = localStorage.getItem(`customCategories_${sessionId}`);
      const stored: Array<{ id: string; name: string }> = storedRaw ? JSON.parse(storedRaw) : [];
      localStorage.setItem(
        `customCategories_${sessionId}`,
        JSON.stringify(stored.filter((c) => c.id !== categoryId))
      );

      const remaining = categories.filter((c) => c.id !== categoryId);
      setCategories(remaining);

      if (activeCategory === categoryId) {
        setActiveCategory(remaining[0]?.id ?? "sustainability");
        setMessages([]);
      }

      await fetchCategoryCounts();
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  const viewDocument = async (docId: number, filename: string) => {
    try {
      const response = await fetch(`/api/documents/view?sessionId=${sessionId}&documentId=${docId}`);
      const data = await response.json();
      
      if (data.document) {
        setViewingDocument({
          id: docId,
          filename: filename,
          content: data.document.content,
          file_type: data.document.file_type || filename.split('.').pop() || 'txt',
        });
      }
    } catch (error) {
      console.error("Error viewing document:", error);
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
      formData.append("category", activeCategory);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        await fetchDocuments();
        await fetchCategoryCounts();
        await loadCustomCategories();
        
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `✅ Successfully uploaded "${data.filename}" to ${activeCategory}! Processed into ${data.chunks} chunks.`,
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
      await fetchCategoryCounts();
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  const handleCategorySwitch = (categoryId: string) => {
    setActiveCategory(categoryId);
    setMessages([]);
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

    const aiMsgId = crypto.randomUUID();
    let streamStarted = false;

    const addError = (msg: string) => {
      if (streamStarted) {
        setMessages((prev) => prev.map((m) => m.id === aiMsgId ? { ...m, content: msg } : m));
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: msg, timestamp: Date.now() },
        ]);
      }
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          sessionId,
          category: activeCategory,
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          let data: { text?: string; sources?: Source[]; done?: boolean; error?: string };
          try { data = JSON.parse(part.slice(5)); } catch { continue; }

          if (!streamStarted) {
            setMessages((prev) => [
              ...prev,
              { id: aiMsgId, role: "assistant", content: "", timestamp: Date.now() },
            ]);
            setIsLoading(false);
            streamStarted = true;
          }

          if (data.text) {
            setMessages((prev) =>
              prev.map((m) => m.id === aiMsgId ? { ...m, content: m.content + data.text } : m)
            );
          }
          if (data.done) {
            setMessages((prev) =>
              prev.map((m) => m.id === aiMsgId ? { ...m, sources: data.sources ?? [] } : m)
            );
          }
          if (data.error) {
            addError("⚠️ Error: Could not reach the AI server.");
          }
        }
      }
    } catch {
      addError("⚠️ Error: Could not reach the AI server.");
    } finally {
      setIsLoading(false);
    }
  };

  const activeC = categories.find((c) => c.id === activeCategory);

  return (
    <main className="min-h-screen p-6 bg-gradient-to-b from-background to-muted flex justify-center">
      <div className="w-full max-w-5xl flex gap-4">
        {/* Category Sidebar */}
        <Card className="w-64 shadow-2xl border border-border/50">
          <CardHeader className="border-b bg-card/90 backdrop-blur pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Categories</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddCategory(!showAddCategory)}
                className="h-8 w-8 p-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            {showAddCategory && (
              <div className="mb-3 p-2 border rounded-lg">
                <Input
                  placeholder="Category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddCategory();
                    }
                  }}
                  className="mb-2"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddCategory} className="flex-1">
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddCategory(false);
                      setNewCategoryName("");
                    }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="relative group">
                    <button
                      onClick={() => handleCategorySwitch(category.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
                        activeCategory === category.id
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "hover:bg-accent"
                      )}>
                      <div className={cn("p-2 rounded-full", category.color, "bg-opacity-20")}>
                        {category.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{category.name}</div>
                        <div className="text-xs opacity-70">
                          {categoryCounts[category.id] || 0} files
                        </div>
                      </div>
                    </button>
                    {category.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(category.id);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/20 text-destructive"
                        title="Delete category">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Main Chat */}
        <Card className="flex-1 shadow-2xl border border-border/50">
          <CardHeader className="border-b bg-card/90 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-full", activeC?.color, "bg-opacity-20")}>
                  {activeC?.icon}
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">
                    {activeC?.name} Assistant
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {documents.length} files in this category
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDocuments(!showDocuments)}
                  className="gap-2">
                  <FileText className="h-4 w-4" />
                  Files
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
                  accept=".txt,.md,.html,.htm,.pdf,.docx"
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
                    <div className={cn("mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center", activeC?.color, "bg-opacity-20")}>
                      {activeC?.icon}
                    </div>
                    <p className="text-lg font-medium">
                      Upload {activeC?.name} documents
                    </p>
                  </div>
                )}

                {messages.map((m) => (
                  <ChatBubble key={m.id} message={m} />
                ))}

                {isLoading && (
                  <div className="flex gap-2 items-center px-3">
                    <div className="mr-auto bg-secondary text-secondary-foreground rounded-xl p-3 shadow-sm flex gap-1 items-center">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:0ms]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
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
                placeholder={`Ask about your ${activeC?.name} documents...`}
                className="min-h-[55px] max-h-[120px] resize-none flex-1"
                disabled={documents.length === 0}
              />
              <Button type="submit" disabled={isLoading || documents.length === 0} className="h-[55px]">
                Send
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Documents Panel */}
        {showDocuments && (
          <Card className="w-80 shadow-2xl border border-border/50">
            <CardHeader className="border-b bg-card/90 backdrop-blur flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{activeC?.name} Files</CardTitle>
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
                    No documents in this category yet
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
                            <div className="flex gap-1 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => viewDocument(doc.id, doc.filename)}
                                className="h-7 text-xs gap-1">
                                <Eye className="h-3 w-3" />
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteDocument(doc.id)}
                                className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </Button>
                            </div>
                          </div>
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

      {/* Document Viewer Modal */}
      {viewingDocument && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[80vh] flex flex-col">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{viewingDocument.filename}</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      const isHtml = viewingDocument.file_type === 'html' || viewingDocument.file_type === 'htm';
                      const mime = isHtml ? 'text/html' : 'text/plain';
                      const blob = new Blob([viewingDocument.content], { type: mime });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                      setTimeout(() => URL.revokeObjectURL(url), 30000);
                    }}>
                    <ExternalLink className="h-3 w-3" />
                    Open in tab
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingDocument(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              {(viewingDocument.file_type === 'html' || viewingDocument.file_type === 'htm') ? (
                <iframe
                  srcDoc={viewingDocument.content}
                  className="w-full h-[60vh] border-0"
                  sandbox="allow-same-origin"
                  title={viewingDocument.filename}
                />
              ) : (
                <ScrollArea className="h-[60vh] p-6">
                  <pre className="whitespace-pre-wrap text-sm font-mono">
                    {viewingDocument.content}
                  </pre>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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
        {message.content ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="flex gap-1 items-center py-1 px-1">
            <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:0ms]" />
            <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:150ms]" />
            <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        )}
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
                    "{source.excerpt.substring(0, 200)}
                    {source.excerpt.length > 200 ? "..." : ""}"
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
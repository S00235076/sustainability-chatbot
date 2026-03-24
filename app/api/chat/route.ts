// app/api/chat/route.ts
// Category-aware chat API

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getRelevantContext, RAG_SYSTEM_PROMPT } from "@/lib/rag-query-multiuser";
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!, 
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages as { role: "user" | "assistant"; content: string }[];
    const sessionId = body.sessionId as string;
    const category = body.category as string || "sustainability";
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "No session ID provided" },
        { status: 400 }
      );
    }
    
    const lastUserMessage = messages[messages.length - 1].content;
    
    const { context, sources } = await getRelevantContext(lastUserMessage, sessionId, category);
    
    if (!context || context.trim() === '') {
      return NextResponse.json({
        reply: `It looks like you haven't uploaded any documents in the "${category}" category yet. Please upload some files to this category first!`,
        sources: []
      });
    }
    
    const enhancedSystemPrompt = `${RAG_SYSTEM_PROMPT}

Current category: ${category}

IMPORTANT CITATION RULES:
1. When answering, cite sources by referring to them as [Source 1], [Source 2], etc.
2. ONLY cite sources that you actually use in your answer
3. When you reference information, use the EXACT wording from the source
4. Each [Source N] corresponds to a specific excerpt
5. Don't cite unless directly using information from that excerpt`;
    
    const messagesWithContext = [
      { role: "system" as const, content: enhancedSystemPrompt },
      { 
        role: "user" as const, 
        content: `Context from your ${category} documents:\n\n${context}\n\nQuestion: ${lastUserMessage}` 
      },
      ...messages.slice(0, -1).slice(-4),
    ];
    
    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesWithContext,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    
    const citedSourceIds = new Set<number>();
    const sourcePattern = /\[Source (\d+)\]/g;
    let match;
    
    while ((match = sourcePattern.exec(reply)) !== null) {
      citedSourceIds.add(parseInt(match[1]));
    }
    
    const usedSources = sources
      .map((source, index) => ({
        id: index + 1,
        filename: source.filename,
        excerpt: source.excerpt,
        category: source.category,
      }))
      .filter(source => citedSourceIds.has(source.id));
    
    return NextResponse.json({ 
      reply,
      sources: usedSources
    });
    
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process request', 
        reply: 'Sorry, I encountered an error.' 
      },
      { status: 500 }
    );
  }
}
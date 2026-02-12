import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getRelevantContext, RAG_SYSTEM_PROMPT } from "@/lib/rag-query";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!, 
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages as { role: "user" | "assistant"; content: string }[];
    
    // Get the last user message
    const lastUserMessage = messages[messages.length - 1].content;
    
    // Get relevant context from your HTML documents
    const { context, sources } = await getRelevantContext(lastUserMessage);
    
    // Add context to the conversation
    const messagesWithContext = [
      { role: "system" as const, content: RAG_SYSTEM_PROMPT },
      { 
        role: "user" as const, 
        content: `Context from knowledge base:\n\n${context}\n\nUser question: ${lastUserMessage}` 
      },
      // Include previous conversation for context (last 4 messages)
      ...messages.slice(0, -1).slice(-4),
    ];
    
    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesWithContext,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    
    // Return response with sources
    return NextResponse.json({ 
      reply,
      sources 
    });
    
  } catch (error) {
    console.error('RAG Error:', error);
    
    // If RAG fails, return error
    return NextResponse.json(
      { error: 'Failed to process request', reply: 'Sorry, I encountered an error.' },
      { status: 500 }
    );
  }
}
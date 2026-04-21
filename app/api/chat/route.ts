import OpenAI from "openai";
import { NextRequest } from "next/server";
import { getRelevantContext, RAG_SYSTEM_PROMPT } from "@/lib/rag-query-multiuser";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const send = (data: object) => encoder.encode(`data:${JSON.stringify(data)}\n\n`);

  try {
    const body = await req.json();
    const messages = body.messages as { role: "user" | "assistant"; content: string }[];
    const sessionId = body.sessionId as string;
    const category = body.category as string || "sustainability";

    if (!sessionId) {
      return new Response(send({ error: "No session ID provided" }), {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    const lastUserMessage = messages[messages.length - 1].content;
    const { context, sources } = await getRelevantContext(lastUserMessage, sessionId, category);

    if (!context || context.trim() === "") {
      const msg = `It looks like you haven't uploaded any documents in the "${category}" category yet. Please upload some files to this category first!`;
      const body = new Uint8Array([...send({ text: msg }), ...send({ sources: [], done: true })]);
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    }

    const enhancedSystemPrompt = `${RAG_SYSTEM_PROMPT}

Current category: ${category}

CITATION RULES:
- Cite sources as [Source 1], [Source 2], etc. when using information from them
- Only cite sources you actually use in your answer
- Do not invent information not present in the context`;

    // History first, then current question with injected context — correct ordering
    const messagesWithContext = [
      { role: "system" as const, content: enhancedSystemPrompt },
      ...messages.slice(0, -1).slice(-6),
      {
        role: "user" as const,
        content: `Context from your ${category} documents:\n\n${context}\n\nQuestion: ${lastUserMessage}`,
      },
    ];

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messagesWithContext,
      temperature: 0.3,
      stream: true,
    });

    const readable = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              fullReply += text;
              controller.enqueue(send({ text }));
            }
          }

          // Parse which sources were actually cited
          const citedIds = new Set<number>();
          const pattern = /\[Source (\d+)\]/g;
          let match;
          while ((match = pattern.exec(fullReply)) !== null) {
            citedIds.add(parseInt(match[1]));
          }

          const usedSources = sources
            .map((s, i) => ({ id: i + 1, filename: s.filename, excerpt: s.excerpt, category: s.category }))
            .filter((s) => citedIds.has(s.id));

          controller.enqueue(send({ sources: usedSources, done: true }));
        } catch {
          controller.enqueue(send({ error: "Stream error" }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(send({ error: "Failed to process request" }), {
      status: 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}

import OpenAI from "openai";
import { NextRequest } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!, 
});

export async function POST(req: NextRequest) {
  const body = await req.json();

  const messages = body.messages as { role: "user" | "assistant"; content: string }[];

  const completion = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
  });

  const reply = completion.choices[0]?.message?.content ?? "";

  return Response.json({ reply });
}

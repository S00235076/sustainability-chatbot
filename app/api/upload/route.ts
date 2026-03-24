// app/api/upload/route.ts
// Handle file uploads with category support

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";
import * as cheerio from "cheerio";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function getOrCreateUser(sessionId: string) {
  const sql = neon(process.env.DATABASE_URL!);
  
  const existing = await sql`
    SELECT id FROM users WHERE session_id = ${sessionId}
  ` as Array<{ id: number }>;
  
  if (existing.length > 0) {
    await sql`UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ${existing[0].id}`;
    return existing[0].id;
  }
  
  const newUser = await sql`
    INSERT INTO users (session_id) VALUES (${sessionId}) RETURNING id
  ` as Array<{ id: number }>;
  
  return newUser[0].id;
}

function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script').remove();
  $('style').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function extractTextFromPlainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    start += chunkSize - overlap;
  }
  
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sessionId = formData.get("sessionId") as string;
    const category = formData.get("category") as string || "sustainability";
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    
    if (!sessionId) {
      return NextResponse.json({ error: "No session ID provided" }, { status: 400 });
    }
    
    const filename = file.name;
    const fileType = file.type;
    const fileSize = file.size;
    
    const fileContent = await file.text();
    
    let extractedText = "";
    if (fileType === "text/html" || filename.endsWith(".html") || filename.endsWith(".htm")) {
      extractedText = extractTextFromHtml(fileContent);
    } else {
      extractedText = extractTextFromPlainText(fileContent);
    }
    
    if (!extractedText || extractedText.length < 10) {
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    const userId = await getOrCreateUser(sessionId);
    
    // Store document with category
    const docResult = await sql`
      INSERT INTO documents (user_id, filename, content, category, file_type, file_size)
      VALUES (${userId}, ${filename}, ${extractedText}, ${category}, ${fileType}, ${fileSize})
      RETURNING id
    ` as Array<{ id: number }>;
    
    const documentId = docResult[0].id;
    
    const chunks = chunkText(extractedText);
    
    let processedChunks = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      
      // Store chunk with category
      await sql`
        INSERT INTO document_chunks (document_id, user_id, category, chunk_text, chunk_index, embedding)
        VALUES (
          ${documentId}, 
          ${userId}, 
          ${category},
          ${chunk}, 
          ${i}, 
          ${JSON.stringify(embedding)}
        )
      `;
      
      processedChunks++;
    }
    
    return NextResponse.json({
      success: true,
      message: "File uploaded and processed successfully",
      documentId,
      filename,
      category,
      chunks: processedChunks,
      textLength: extractedText.length
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process file", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
// app/api/upload/route.ts
// Handle file uploads from users

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";
import * as cheerio from "cheerio";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Helper: Get or create user by session ID
async function getOrCreateUser(sessionId: string) {
  const sql = neon(process.env.DATABASE_URL!);
  
  // Try to find existing user
  const existing = await sql`
    SELECT id FROM users WHERE session_id = ${sessionId}
  ` as Array<{ id: number }>;
  
  if (existing.length > 0) {
    // Update last active
    await sql`UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ${existing[0].id}`;
    return existing[0].id;
  }
  
  // Create new user
  const newUser = await sql`
    INSERT INTO users (session_id) VALUES (${sessionId}) RETURNING id
  ` as Array<{ id: number }>;
  
  return newUser[0].id;
}

// Helper: Extract text from HTML
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script').remove();
  $('style').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

// Helper: Extract text from plain text file
function extractTextFromPlainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Helper: Chunk text into smaller pieces
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
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    
    if (!sessionId) {
      return NextResponse.json({ error: "No session ID provided" }, { status: 400 });
    }
    
    // Get file details
    const filename = file.name;
    const fileType = file.type;
    const fileSize = file.size;
    
    // Read file content
    const fileContent = await file.text();
    
    // Extract text based on file type
    let extractedText = "";
    if (fileType === "text/html" || filename.endsWith(".html") || filename.endsWith(".htm")) {
      extractedText = extractTextFromHtml(fileContent);
    } else {
      // Plain text, markdown, etc.
      extractedText = extractTextFromPlainText(fileContent);
    }
    
    if (!extractedText || extractedText.length < 10) {
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 400 });
    }
    
    // Get or create user
    const sql = neon(process.env.DATABASE_URL!);
    const userId = await getOrCreateUser(sessionId);
    
    // Store document
    const docResult = await sql`
      INSERT INTO documents (user_id, filename, content, file_type, file_size)
      VALUES (${userId}, ${filename}, ${extractedText}, ${fileType}, ${fileSize})
      RETURNING id
    ` as Array<{ id: number }>;
    
    const documentId = docResult[0].id;
    
    // Chunk the text
    const chunks = chunkText(extractedText);
    
    // Generate embeddings and store chunks
    let processedChunks = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      
      // Store chunk with embedding
      await sql`
        INSERT INTO document_chunks (document_id, user_id, chunk_text, chunk_index, embedding)
        VALUES (
          ${documentId}, 
          ${userId}, 
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
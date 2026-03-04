// lib/rag-query-multiuser.ts
// User-specific RAG with text excerpt citations

import { neon } from '@neondatabase/serverless';
import OpenAI from 'openai';

export interface RAGResult {
  context: string;
  sources: Array<{
    filename: string;
    similarity: number;
    excerpt: string;
  }>;
}

interface QueryResult {
  chunk_text: string;
  filename: string;
  similarity: string;
}

/**
 * Get relevant context from a specific user's documents
 */
export async function getRelevantContext(
  userQuery: string,
  sessionId: string,
  topK: number = 5
): Promise<RAGResult> {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!databaseUrl) throw new Error('DATABASE_URL not found');
  if (!apiKey) throw new Error('OPENAI_API_KEY not found');
  
  const sql = neon(databaseUrl);
  const openai = new OpenAI({ apiKey });
  
  // Get user ID
  const userResult = await sql`
    SELECT id FROM users WHERE session_id = ${sessionId}
  ` as Array<{ id: number }>;
  
  if (userResult.length === 0) {
    // No user found, return empty context
    return { context: '', sources: [] };
  }
  
  const userId = userResult[0].id;
  
  // Generate embedding for user's query
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userQuery,
  });
  const queryEmbedding = response.data[0].embedding;
  
  // Find most similar chunks from THIS USER's documents only
  const results = await sql`
    SELECT 
      dc.chunk_text,
      d.filename,
      1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE dc.user_id = ${userId}
    ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${topK}
  ` as QueryResult[];
  
  // If no results, return empty
  if (results.length === 0) {
    return { context: '', sources: [] };
  }
  
  // Format context for LLM with source numbers
  const context = results
    .map((row, i) => 
      `[Source ${i + 1}: ${row.filename}]\n${row.chunk_text}`
    )
    .join('\n\n');
  
  // Return sources with the actual excerpts
  const sources = results.map((row) => ({
    filename: row.filename,
    similarity: parseFloat(row.similarity),
    excerpt: row.chunk_text,
  }));
  
  return { context, sources };
}

/**
 * System prompt for multi-user chatbot
 */
export const RAG_SYSTEM_PROMPT = `You are an AI Assistant that helps users understand their uploaded documents.

CRITICAL RULES:
1. Only use information from the provided context to answer questions
2. Always cite your sources using [Source 1], [Source 2], etc. when stating information
3. If the context doesn't contain the answer, say "I don't have that information in your uploaded documents"
4. Do not make up or infer information beyond what's explicitly in the context
5. Be helpful and specific - mention which document the information comes from
6. Keep answers practical and based on the user's documents

You are answering based on documents the user has uploaded to their personal knowledge base.`;
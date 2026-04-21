import { neon } from '@neondatabase/serverless';
import OpenAI from 'openai';

export interface RAGResult {
  context: string;
  sources: Array<{
    filename: string;
    similarity: number;
    excerpt: string;
    category: string;
  }>;
}

interface QueryResult {
  chunk_text: string;
  filename: string;
  similarity: string;
  category: string;
}

export async function getRelevantContext(
  userQuery: string,
  sessionId: string,
  category: string,
  topK: number = 5
): Promise<RAGResult> {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!databaseUrl) throw new Error('DATABASE_URL not found');
  if (!apiKey) throw new Error('OPENAI_API_KEY not found');
  
  const sql = neon(databaseUrl);
  const openai = new OpenAI({ apiKey });
  
  const userResult = await sql`
    SELECT id FROM users WHERE session_id = ${sessionId}
  ` as Array<{ id: number }>;
  
  if (userResult.length === 0) {
    return { context: '', sources: [] };
  }
  
  const userId = userResult[0].id;
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userQuery,
  });
  const queryEmbedding = response.data[0].embedding;
  
  // Search only in the specified category
  const results = await sql`
    SELECT 
      dc.chunk_text,
      d.filename,
      d.category,
      1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE dc.user_id = ${userId} AND dc.category = ${category}
    ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${topK}
  ` as QueryResult[];
  
  if (results.length === 0) {
    return { context: '', sources: [] };
  }
  
  const context = results
    .map((row, i) => 
      `[Source ${i + 1}: ${row.filename}]\n${row.chunk_text}`
    )
    .join('\n\n');
  
  const sources = results.map((row) => ({
    filename: row.filename,
    similarity: parseFloat(row.similarity),
    excerpt: row.chunk_text,
    category: row.category,
  }));
  
  return { context, sources };
}

export const RAG_SYSTEM_PROMPT = `You are an AI Assistant that helps users understand their uploaded documents.

CRITICAL RULES:
1. Only use information from the provided context to answer questions
2. Always cite your sources using [Source 1], [Source 2], etc. when stating information
3. If the context doesn't contain the answer, say "I don't have that information in your uploaded documents for this category"
4. Do not make up or infer information beyond what's explicitly in the context
5. Be helpful and specific - mention which document the information comes from
6. Keep answers practical and based on the user's documents

You are answering based on documents the user has uploaded to their personal knowledge base.`;
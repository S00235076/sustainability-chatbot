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


export async function getRelevantContext(
  userQuery: string,
  topK: number = 5
): Promise<RAGResult> {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!databaseUrl) throw new Error('DATABASE_URL not found');
  if (!apiKey) throw new Error('OPENAI_API_KEY not found');
  
  const sql = neon(databaseUrl);
  const openai = new OpenAI({ apiKey });
  
  // Generate embedding for user's query
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userQuery,
  });
  const queryEmbedding = response.data[0].embedding;
  
  // Find most similar chunks from your documents
  const results = await sql`
    SELECT 
      dc.chunk_text,
      d.filename,
      1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${topK}
  ` as QueryResult[];
  
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
    excerpt: row.chunk_text, // Include the actual text chunk
  }));
  
  return { context, sources };
}

/**
 * System prompt that ensures AI cites sources and only uses provided context
 */
export const RAG_SYSTEM_PROMPT = `You are a Sustainability AI Assistant that helps with household sustainability questions.

CRITICAL RULES:
1. Only use information from the provided context to answer questions
2. Always cite your sources using [Source 1], [Source 2], etc. when stating information
3. If the context doesn't contain the answer, say "I don't have that information in my knowledge base"
4. Do not make up or infer information beyond what's explicitly in the context
5. Be helpful and specific - mention which document the information comes from
6. Keep answers practical and actionable

Focus on household sustainability topics like energy efficiency, waste reduction, water conservation, sustainable living practices, etc.`;
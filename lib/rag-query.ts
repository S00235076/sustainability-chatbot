
import { neon } from '@neondatabase/serverless';
import OpenAI from 'openai';

export interface RAGResult {
  context: string;
  sources: Array<{
    filename: string;
    similarity: number;
  }>;
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
  `;
  
  // Format context for LLM
  const context = results
    .map((row: any, i: number) => 
      `[Source ${i + 1}: ${row.filename}]\n${row.chunk_text}`
    )
    .join('\n\n');
  
  const sources = results.map((row: any) => ({
    filename: row.filename,
    similarity: parseFloat(row.similarity),
  }));
  
  return { context, sources };
}

/**
 * System prompt that also ensures AI only uses your documents
 */
export const RAG_SYSTEM_PROMPT = `You are a Sustainability AI Assistant that helps with household sustainability questions.

CRITICAL RULES:
1. Only use information from the provided context to answer questions
2. If the context doesn't contain the answer, say "I don't have that information in my knowledge base about household sustainability"
3. Do not make up or infer information beyond what's in the context
4. Be helpful and cite the source documents when answering
5. Keep answers concise and practical

Focus on household sustainability topics like energy efficiency, waste reduction, water conservation, sustainable living practices, etc.`;
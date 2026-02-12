import { neon } from '@neondatabase/serverless';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); 

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

async function extractTextFromHtml(htmlPath: string): Promise<string> {
  const html = await fs.readFile(htmlPath, 'utf-8');
  const $ = cheerio.load(html);
  
  $('script, style').remove();
  
  const text = $.text()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return text;
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    let chunk = text.substring(start, end);

    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > CHUNK_SIZE * 0.5) {
        chunk = chunk.substring(0, breakPoint + 1);
        end = start + breakPoint + 1;
      }
    }

    chunks.push(chunk.trim());
    start = end - CHUNK_OVERLAP;
  }

  return chunks.filter(chunk => chunk.length > 0);
}

async function generateEmbedding(openai: OpenAI, text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function ingestDirectory(dirPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!databaseUrl) throw new Error('DATABASE_URL not found in .env.local');
  if (!apiKey) throw new Error('OPENAI_API_KEY not found in .env.local');
  
  const sql = neon(databaseUrl);
  const openai = new OpenAI({ apiKey });
  
  console.log('\n Starting HTML ingestion...');
  console.log(`Source: ${dirPath}\n`);
  
  const files = await fs.readdir(dirPath);
  const htmlFiles = files.filter(f => f.endsWith('.html') || f.endsWith('.htm'));
  
  if (htmlFiles.length === 0) {
    console.log('No HTML files found in directory');
    return;
  }
  
  console.log(`Found ${htmlFiles.length} HTML file(s)\n`);
  console.log('═'.repeat(60));
  
  // Process each file
  for (const file of htmlFiles) {
    const filePath = path.join(dirPath, file);
    const filename = path.basename(filePath);
    
    console.log(`\n File Processing: ${filename}`);
    
    try {
      const text = await extractTextFromHtml(filePath);
      
      if (!text.trim()) {
        console.log(' No text content found, skipping');
        continue;
      }
      
      const chunks = chunkText(text);
      console.log(` Created ${chunks.length} chunks`);
      
      // Insert document
      const docResult = await sql`
        INSERT INTO documents (filename, content)
        VALUES (${filename}, ${text})
        RETURNING id
      ` as Array<{ id: number }>;
      
      const documentId = docResult[0].id;
      
      // Insert chunks with embeddings
      for (let i = 0; i < chunks.length; i++) {
        process.stdout.write(`  Embedding chunk ${i + 1}/${chunks.length}...\r`);
        
        const embedding = await generateEmbedding(openai, chunks[i]);
        
        await sql`
          INSERT INTO document_chunks (document_id, chunk_text, chunk_index, embedding)
          VALUES (
            ${documentId},
            ${chunks[i]},
            ${i},
            ${JSON.stringify(embedding)}::vector
          )
        `;
      }
      
      console.log(`  Ingested successfully (Document ID: ${documentId})`);
      
    } catch (error) {
      console.log(` Error: ${error}`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  
  const docCountResult = await sql`SELECT COUNT(*) as count FROM documents` as Array<{ count: string }>;
  const chunkCountResult = await sql`SELECT COUNT(*) as count FROM document_chunks` as Array<{ count: string }>;
  
  console.log('\n Database Statistics:');
  console.log(`   Total documents: ${docCountResult[0].count}`);
  console.log(`   Total chunks: ${chunkCountResult[0].count}`);
  console.log('\n Ingestion complete!\n');
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('\n Error: No directory specified');
  console.log('\n Usage: npx tsx scripts/ingest-html.ts <html-directory>');
  console.log('Example: npx tsx scripts/ingest-html.ts ./public/docs\n');
  process.exit(1);
}

ingestDirectory(args[0])
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n Error:', error);
    process.exit(1);
  });
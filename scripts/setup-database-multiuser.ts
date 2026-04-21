// scripts/setup-database-multiuser.ts
// Enhanced database setup for multi-user file uploads

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function setupDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found in .env.local file');
  }

  const sql = neon(databaseUrl);

  console.log('\n🚀 Setting up Multi-User Neon database...\n');

  try {
    console.log('1. Enabling pgvector extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log('   ✓ Done\n');

    console.log('2. Creating users table...');
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('   ✓ Done\n');

    console.log('3. Creating documents table (with user_id)...');
    await sql`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        file_type VARCHAR(255),
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('   ✓ Done\n');

    console.log('4. Creating document_chunks table...');
    await sql`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('   ✓ Done\n');

    console.log('5. Creating vector similarity index...');
    await sql`
      CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
      ON document_chunks 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `;
    console.log('   ✓ Done\n');

    console.log('6. Creating user-specific index for faster queries...');
    await sql`
      CREATE INDEX IF NOT EXISTS document_chunks_user_id_idx 
      ON document_chunks(user_id)
    `;
    console.log('   ✓ Done\n');

    console.log('7. Creating documents user index...');
    await sql`
      CREATE INDEX IF NOT EXISTS documents_user_id_idx 
      ON documents(user_id)
    `;
    console.log('   ✓ Done\n');

    console.log('✅ Database setup complete!\n');
    console.log('📊 Schema created:');
    console.log('   - users (session-based user tracking)');
    console.log('   - documents (user-specific file storage)');
    console.log('   - document_chunks (user-specific text chunks with embeddings)');
    console.log('   - Indexes for fast vector similarity search\n');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  }
}

setupDatabase();
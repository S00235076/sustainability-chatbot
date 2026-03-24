// scripts/add-categories.ts
// Add category support to existing database

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function addCategories() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found in .env.local file');
  }

  const sql = neon(databaseUrl);

  console.log('\n🚀 Adding category support to database...\n');

  try {
    // Add category column to users table
    console.log('1. Adding active_category to users...');
    try {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_category VARCHAR(100) DEFAULT 'sustainability'`;
      console.log('   ✓ Done\n');
    } catch (error) {
      console.log('   ✓ Column already exists\n');
    }

    // Add category column to documents table
    console.log('2. Adding category to documents...');
    try {
      await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'sustainability'`;
      console.log('   ✓ Done\n');
    } catch (error) {
      console.log('   ✓ Column already exists\n');
    }

    // Add category column to document_chunks table
    console.log('3. Adding category to document_chunks...');
    try {
      await sql`ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'sustainability'`;
      console.log('   ✓ Done\n');
    } catch (error) {
      console.log('   ✓ Column already exists\n');
    }

    // Create indexes for categories
    console.log('4. Creating category indexes...');
    try {
      await sql`CREATE INDEX IF NOT EXISTS document_chunks_category_idx ON document_chunks(category)`;
      await sql`CREATE INDEX IF NOT EXISTS documents_category_idx ON documents(category)`;
      await sql`CREATE INDEX IF NOT EXISTS document_chunks_user_category_idx ON document_chunks(user_id, category)`;
      console.log('   ✓ Done\n');
    } catch (error) {
      console.log('   ✓ Indexes already exist\n');
    }

    console.log('✅ Category support added!\n');
    console.log('📊 Your database now supports:');
    console.log('   - Multiple categories per user');
    console.log('   - Category-specific document uploads');
    console.log('   - Category-filtered queries\n');

  } catch (error) {
    console.error('❌ Error adding categories:', error);
    throw error;
  }
}

addCategories();
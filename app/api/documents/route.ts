// app/api/documents/route.ts
// Get/delete documents with category filtering

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const category = req.nextUrl.searchParams.get("category");
    
    if (!sessionId) {
      return NextResponse.json({ error: "No session ID provided" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;
    
    if (userResult.length === 0) {
      return NextResponse.json({ documents: [] });
    }
    
    const userId = userResult[0].id;
    
    // Get documents, optionally filtered by category
    let documents;
    if (category) {
      documents = await sql`
        SELECT 
          d.id,
          d.filename,
          d.category,
          d.file_type,
          d.file_size,
          d.created_at,
          COUNT(dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.user_id = ${userId} AND d.category = ${category}
        GROUP BY d.id, d.filename, d.category, d.file_type, d.file_size, d.created_at
        ORDER BY d.created_at DESC
      ` as Array<{
        id: number;
        filename: string;
        category: string;
        file_type: string;
        file_size: number;
        created_at: string;
        chunk_count: number;
      }>;
    } else {
      documents = await sql`
        SELECT 
          d.id,
          d.filename,
          d.category,
          d.file_type,
          d.file_size,
          d.created_at,
          COUNT(dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.user_id = ${userId}
        GROUP BY d.id, d.filename, d.category, d.file_type, d.file_size, d.created_at
        ORDER BY d.created_at DESC
      ` as Array<{
        id: number;
        filename: string;
        category: string;
        file_type: string;
        file_size: number;
        created_at: string;
        chunk_count: number;
      }>;
    }
    
    return NextResponse.json({ documents });
    
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const sessionId = searchParams.get("sessionId");
    const documentId = searchParams.get("documentId");
    
    if (!sessionId || !documentId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;
    
    if (userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    const userId = userResult[0].id;
    
    await sql`
      DELETE FROM documents 
      WHERE id = ${parseInt(documentId)} AND user_id = ${userId}
    `;
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}

// New endpoint to get category counts
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId;
    
    if (!sessionId) {
      return NextResponse.json({ error: "No session ID provided" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;
    
    if (userResult.length === 0) {
      return NextResponse.json({ categories: {} });
    }
    
    const userId = userResult[0].id;
    
    // Get count of documents per category
    const categoryCounts = await sql`
      SELECT category, COUNT(*) as count
      FROM documents
      WHERE user_id = ${userId}
      GROUP BY category
    ` as Array<{ category: string; count: number }>;
    
    const categories: Record<string, number> = {};
    categoryCounts.forEach(row => {
      categories[row.category] = Number(row.count);
    });
    
    return NextResponse.json({ categories });
    
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
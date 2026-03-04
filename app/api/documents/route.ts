// app/api/documents/route.ts
// Get list of user's uploaded documents

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    
    if (!sessionId) {
      return NextResponse.json({ error: "No session ID provided" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    // Get user ID
    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;
    
    if (userResult.length === 0) {
      return NextResponse.json({ documents: [] });
    }
    
    const userId = userResult[0].id;
    
    // Get user's documents
    const documents = await sql`
      SELECT 
        d.id,
        d.filename,
        d.file_type,
        d.file_size,
        d.created_at,
        COUNT(dc.id) as chunk_count
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.user_id = ${userId}
      GROUP BY d.id, d.filename, d.file_type, d.file_size, d.created_at
      ORDER BY d.created_at DESC
    ` as Array<{
      id: number;
      filename: string;
      file_type: string;
      file_size: number;
      created_at: string;
      chunk_count: number;
    }>;
    
    return NextResponse.json({ documents });
    
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// Delete a document
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const sessionId = searchParams.get("sessionId");
    const documentId = searchParams.get("documentId");
    
    if (!sessionId || !documentId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    // Get user ID
    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;
    
    if (userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    const userId = userResult[0].id;
    
    // Delete document (cascades to chunks)
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
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const documentId = req.nextUrl.searchParams.get("documentId");
    
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
    
    // Get document content - ensure it belongs to this user
    const documents = await sql`
      SELECT id, filename, content, category, file_type, file_size, created_at
      FROM documents
      WHERE id = ${parseInt(documentId)} AND user_id = ${userId}
    ` as Array<{
      id: number;
      filename: string;
      content: string;
      category: string;
      file_type: string;
      file_size: number;
      created_at: string;
    }>;
    
    if (documents.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    
    return NextResponse.json({ document: documents[0] });
    
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}
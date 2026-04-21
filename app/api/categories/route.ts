import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// Get all categories for a user
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    
    if (!sessionId) {
      return NextResponse.json({ error: "No session ID provided" }, { status: 400 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;
    
    if (userResult.length === 0) {
      return NextResponse.json({ categories: [] });
    }
    
    const userId = userResult[0].id;
    
    // Get unique categories from user's documents
    const categories = await sql`
      SELECT DISTINCT category, COUNT(*) as file_count
      FROM documents
      WHERE user_id = ${userId}
      GROUP BY category
      ORDER BY category
    ` as Array<{ category: string; file_count: number }>;
    
    return NextResponse.json({ categories });
    
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// Delete a category and all its documents
export async function DELETE(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const categoryId = req.nextUrl.searchParams.get("categoryId");

    if (!sessionId || !categoryId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const userResult = await sql`
      SELECT id FROM users WHERE session_id = ${sessionId}
    ` as Array<{ id: number }>;

    if (userResult.length === 0) {
      return NextResponse.json({ success: true });
    }

    const userId = userResult[0].id;

    // Delete all chunks for documents in this category
    await sql`
      DELETE FROM document_chunks
      WHERE document_id IN (
        SELECT id FROM documents WHERE user_id = ${userId} AND category = ${categoryId}
      )
    `;

    // Delete all documents in this category
    await sql`
      DELETE FROM documents WHERE user_id = ${userId} AND category = ${categoryId}
    `;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}

// Create a new category (by uploading a file to it)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, categoryName } = body;
    
    if (!sessionId || !categoryName) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
    
    // Validate category name (lowercase, no spaces, alphanumeric + hyphen)
    const validCategoryName = categoryName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    if (!validCategoryName) {
      return NextResponse.json({ error: "Invalid category name" }, { status: 400 });
    }
    
    return NextResponse.json({ 
      success: true, 
      categoryId: validCategoryName,
      categoryName: validCategoryName
    });
    
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
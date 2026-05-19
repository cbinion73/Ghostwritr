/**
 * JARVIS Internal API
 * Provides book + stage data for the JARVIS AI assistant dashboard.
 * No auth required for local-only access (localhost only).
 */
import { NextResponse } from "next/server";
import { listBooks } from "@/lib/repositories/books";

export async function GET() {
  try {
    const books = await listBooks();
    return NextResponse.json({
      ok: true,
      books: books.map((book) => ({
        id: book.id,
        slug: book.slug,
        titleWorking: book.titleWorking,
        subtitle: book.subtitle,
        status: book.status,
        workflowType: book.workflowType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        stages: book.stages.map((stage) => ({
          id: stage.id,
          stageKey: stage.stageKey,
          status: stage.status,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
        })),
      })),
    });
  } catch (err) {
    console.error("[JARVIS API] listBooks failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

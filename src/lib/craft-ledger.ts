import { db } from "./db";
import { parseMetadataRecord } from "./artifact-schemas";
import { updateBookMetadata } from "./repositories/books";

/**
 * Craft ledger — the book's persistent memory of author feedback.
 *
 * Every revision instruction an author gives ("stop overusing metaphors",
 * "make openings more personal") is appended here and injected into every
 * subsequent drafting/revision call, so feedback given on chapter 3 still
 * shapes chapter 9. Lives in book.metadataJson (no migration needed), same
 * pattern as workflowAutomation and overnightBuild state.
 */

export type CraftNote = {
  at: string;
  source: "chapter-revision" | "editing" | "manual";
  instruction: string;
};

const MAX_NOTES = 40;
const MAX_INSTRUCTION_CHARS = 600;

function readLedger(metadata: unknown): CraftNote[] {
  const record = parseMetadataRecord(metadata);
  const raw =
    record.craftLedger && typeof record.craftLedger === "object"
      ? (record.craftLedger as { notes?: unknown }).notes
      : null;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (note): note is CraftNote =>
      Boolean(note && typeof note === "object" && typeof (note as CraftNote).instruction === "string"),
  );
}

function normalize(instruction: string) {
  return instruction.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function appendCraftNote(
  bookId: string,
  instruction: string,
  source: CraftNote["source"] = "chapter-revision",
) {
  const trimmed = instruction.trim().slice(0, MAX_INSTRUCTION_CHARS);
  if (trimmed.length < 8) return null; // too short to be real craft feedback

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { metadataJson: true },
  });
  if (!book) return null;

  const existing = readLedger(book.metadataJson);
  const normalized = normalize(trimmed);
  if (existing.some((note) => normalize(note.instruction) === normalized)) {
    return null; // exact repeat — already remembered
  }

  const note: CraftNote = { at: new Date().toISOString(), source, instruction: trimmed };
  const record = parseMetadataRecord(book.metadataJson);
  await updateBookMetadata(bookId, {
    ...record,
    craftLedger: { notes: [note, ...existing].slice(0, MAX_NOTES) },
  });
  return note;
}

export async function getCraftNotes(bookId: string, limit = 15): Promise<string[]> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { metadataJson: true },
  });
  if (!book) return [];
  return readLedger(book.metadataJson)
    .slice(0, limit)
    .map((note) => note.instruction);
}

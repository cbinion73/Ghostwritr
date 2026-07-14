import { getBookBySlugOrThrow } from "../repositories/books";
import { getCommittedPhase1StrategicBrief } from "../repositories/phase1-strategic-brief-artifacts";

export async function getApprovedPhase1StrategicBriefGate(bookId: string) {
  const version = await getCommittedPhase1StrategicBrief(bookId);
  return {
    approved: Boolean(version),
    versionId: version?.id ?? null,
    versionNumber: version?.versionNumber ?? null,
  };
}

export async function assertApprovedPhase1StrategicBrief(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const gate = await getApprovedPhase1StrategicBriefGate(book.id);

  if (!gate.approved) {
    throw new Error(
      "Approve and commit the unified Phase 1 strategic brief before continuing. Open Promise, complete Book Setup, Promise, readers/personas, exactly three comparable titles, market, voice, length, and KDP choices, then commit Promise.",
    );
  }

  return { book, gate };
}

import { db } from "../db";
import { compilePhase1StrategicBriefForBook } from "../phase1-strategic-brief";
import { createCommittedPhase1StrategicBrief } from "../repositories/phase1-strategic-brief-artifacts";

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function compileAndCommitPhase1StrategicBrief(bookSlug: string) {
  const brief = await compilePhase1StrategicBriefForBook(bookSlug);

  if (!brief.readiness.isComplete) {
    const problems = [...brief.readiness.missing, ...brief.readiness.warnings];
    throw new Error(
      `Phase 1 strategic brief is not ready to approve: ${problems.join(" ")}`,
    );
  }

  const version = await createCommittedPhase1StrategicBrief({
    bookId: brief.bookId,
    brief,
  });

  const existingBook = await db.book.findUnique({
    where: { id: brief.bookId },
    select: { metadataJson: true },
  });
  const existingMetadata = metadataRecord(existingBook?.metadataJson);

  await db.book.update({
    where: { id: brief.bookId },
    data: {
      metadataJson: {
        ...existingMetadata,
        phase1StrategicBriefVersionId: version.id,
        premise: brief.promise.bigIdea,
        promise: brief.promise.statement,
        targetReader: brief.audience.primary,
        voiceTone: brief.voice.voiceTone,
        readerLevel: brief.voice.readerLevel,
        chapterFormat: brief.voice.chapterFormat,
        writerPersonaBlend: brief.voice.writerPersonaBlend,
        targetWordCount: brief.book.targetWordCount,
        targetPageCount: brief.book.targetPageCount,
        trimSize: brief.book.trimSize,
        outputFormats: brief.book.outputFormats,
      },
    },
  });

  return { brief, version };
}

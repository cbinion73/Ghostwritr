import type { BookSetupProfile } from "../book-setup-types";
import { DEFAULT_BOOK_SETUP_PROFILE } from "../book-setup-types";
import { parseStoredJson } from "../json-utils";
import { StageKey } from "@prisma/client";
import { db } from "../db";
import { getOrCreateBookBySlug, getStageForBook } from "../repositories/books";
import {
  commitBookSetup,
  createBookSetupVersion,
  getBookSetupVersions,
  getCommittedBookSetup,
} from "../repositories/book-setup-artifacts";
import { createDirectionEvent, listDirectionEventsForStage } from "../repositories/direction-events";
import { getWriterPersonaById, listWriterPersonas } from "../repositories/writer-personas";

export async function saveBookSetupWorkflow(bookSlug: string, profile: BookSetupProfile) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const version = await createBookSetupVersion({
    bookId: book.id,
    profile,
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.BOOK_SETUP,
    eventType: "BOOK_SETUP_SAVED",
    title: "Saved book setup",
    content: `Writer persona set to ${profile.writerPersona}.`,
    metadataJson: {
      versionId: version.id,
      targetWordCount: profile.targetWordCount,
      trimSize: profile.trimSize,
      outputFormats: profile.outputFormats,
      baseStoryFormatPreference: profile.baseStoryFormatPreference,
      aiAuthorshipGuardEnabled: profile.aiAuthorshipGuardEnabled,
      provenanceTrackingEnabled: profile.provenanceTrackingEnabled,
      marketingHandoffEnabled: profile.marketingHandoffEnabled,
    },
  });

  return version;
}

export async function commitBookSetupWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const committedStage = await commitBookSetup(book.id);
  const committedVersion = await getCommittedBookSetup(book.id);
  const committedProfile = parseStoredJson<BookSetupProfile>(
    committedVersion?.contentJson,
    DEFAULT_BOOK_SETUP_PROFILE,
  );

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.BOOK_SETUP,
    eventType: "BOOK_SETUP_COMMITTED",
    title: "Committed book setup",
    content: `Committed setup for ${committedProfile.writerPersona}.`,
    metadataJson: {
      versionId: committedVersion?.id ?? null,
      targetWordCount: committedProfile.targetWordCount,
      targetPageCount: committedProfile.targetPageCount,
      outputFormats: committedProfile.outputFormats,
      baseStoryFormatPreference: committedProfile.baseStoryFormatPreference,
    },
  });

  // Propagate drafting-context fields to Book.metadataJson so all downstream
  // agents (Quill, Scout, Chronicle) can access them via book.metadataJson.
  const existingMeta = (book.metadataJson && typeof book.metadataJson === "object"
    ? book.metadataJson
    : {}) as Record<string, unknown>;
  await db.book.update({
    where: { id: book.id },
    data: {
      metadataJson: {
        ...existingMeta,
        ...(committedProfile.voiceTone != null && { voiceTone: committedProfile.voiceTone }),
        ...(committedProfile.chapterFormat != null && { chapterFormat: committedProfile.chapterFormat }),
        ...(committedProfile.readerLevel != null && { readerLevel: committedProfile.readerLevel }),
        ...(committedProfile.voiceReferenceNotes?.length && { voiceReferenceNotes: committedProfile.voiceReferenceNotes }),
        ...(committedProfile.writerPersonaBlend?.length && { writerPersonaBlend: committedProfile.writerPersonaBlend }),
        targetWordCount: committedProfile.targetWordCount,
        ...(committedProfile.targetPageCount != null && { targetPageCount: committedProfile.targetPageCount }),
      },
    },
  });

  return committedStage;
}

export async function getBookSetupWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, "BOOK_SETUP");
  const versions = await getBookSetupVersions(book.id);
  const committed = await getCommittedBookSetup(book.id);
  const directionEvents = await listDirectionEventsForStage({
    bookId: book.id,
    stageKey: StageKey.BOOK_SETUP,
  });
  const writerPersonas = await listWriterPersonas();

  const latestProfile = versions[0]
    ? parseStoredJson<BookSetupProfile>(versions[0].contentJson, DEFAULT_BOOK_SETUP_PROFILE)
    : {
        ...DEFAULT_BOOK_SETUP_PROFILE,
        workingTitle: book.titleWorking ?? "",
        subtitle: book.subtitle ?? null,
      };

  return {
    book,
    stage,
    profile: latestProfile,
    writerPersonas,
    selectedWriterPersona:
      latestProfile.writerPersonaId != null
        ? await getWriterPersonaById(latestProfile.writerPersonaId)
        : null,
    committedProfile: committed
      ? parseStoredJson<BookSetupProfile>(committed.contentJson, DEFAULT_BOOK_SETUP_PROFILE)
      : null,
    directionEvents,
    versions: versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
    })),
  };
}

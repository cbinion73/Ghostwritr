import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

import { SourceDocumentCategory, SourceDocumentType, type Prisma, StageKey } from "@prisma/client";

import { db } from "../db";

const REFERENCE_LIBRARY_ROOT = path.join(
  process.cwd(),
  "reference-library",
  "projects",
);

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export async function uploadBookSourceDocument(input: {
  bookId: string;
  stageKey: StageKey;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  note?: string;
  /** If provided, used as the document title (shown to agents as the section header). Defaults to fileName. */
  customTitle?: string;
  metadataJson?: Prisma.InputJsonValue;
}) {
  const uploadId = randomUUID();
  const safeFileName = sanitizeFileSegment(input.fileName || "upload");
  const stageFolder = input.stageKey.toLowerCase();
  const relativeStoragePath = path.join(
    sanitizeFileSegment(input.bookId),
    stageFolder,
    `${uploadId}-${safeFileName}`,
  );
  const absoluteStoragePath = path.join(REFERENCE_LIBRARY_ROOT, relativeStoragePath);

  await mkdir(path.dirname(absoluteStoragePath), { recursive: true });
  await writeFile(absoluteStoragePath, input.bytes);

  return db.sourceDocument.create({
    data: {
      bookId: input.bookId,
      category: SourceDocumentCategory.USER_UPLOAD,
      sourceType: SourceDocumentType.FILE,
      title: input.customTitle ?? input.fileName,
      storagePath: absoluteStoragePath,
      mimeType: input.mimeType || "application/octet-stream",
      metadataJson: {
        stageKey: input.stageKey,
        note: input.note ?? "",
        originalFileName: input.fileName,
        byteSize: input.bytes.byteLength,
        ...(input.metadataJson && typeof input.metadataJson === "object" ? input.metadataJson : {}),
      },
    },
  });
}

export async function listBookSourceDocuments(input: {
  bookId: string;
  stageKey?: StageKey;
  enabledOnly?: boolean;
}) {
  const records = await db.sourceDocument.findMany({
    where: {
      bookId: input.bookId,
      ...(input.stageKey
        ? {
            metadataJson: {
              path: ["stageKey"],
              equals: input.stageKey,
            },
          }
        : {}),
      ...(input.enabledOnly
        ? {
            metadataJson: {
              path: ["enabled"],
              equals: true,
            },
          }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return records;
}

export async function setSourceDocumentEnabled(input: {
  documentId: string;
  enabled: boolean;
}) {
  const existing = await db.sourceDocument.findUniqueOrThrow({
    where: { id: input.documentId },
  });

  const metadata =
    existing.metadataJson && typeof existing.metadataJson === "object"
      ? { ...(existing.metadataJson as Record<string, unknown>) }
      : {};

  metadata.enabled = input.enabled;

  return db.sourceDocument.update({
    where: { id: input.documentId },
    data: {
      metadataJson: metadata as Prisma.InputJsonValue,
    },
  });
}

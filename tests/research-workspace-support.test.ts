import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, ResearchSourceTier, ResearchVerificationStatus } from "@prisma/client";

import {
  getDossierStatus,
  normalizeWorkspaceResearchSource,
} from "../src/lib/workflows/research/workspace-support";

test("Research workspace dossier status preserves drafting thresholds", () => {
  assert.equal(getDossierStatus({}), "EMPTY");
  assert.equal(getDossierStatus({ versionNumber: 1, isCommitted: true }), "COMMITTED");
  assert.equal(getDossierStatus({ versionNumber: 1, verifiedItems: 2 }), "DRAFT");
  assert.equal(
    getDossierStatus({
      versionNumber: 1,
      verifiedItems: 0,
      needsCorroborationItems: 3,
    }),
    "NEEDS_REVIEW",
  );
});

test("Research workspace source normalizer converts persisted source records to dossier sources", () => {
  const publishedAt = new Date("2026-01-02T03:04:05.000Z");
  const accessedAt = new Date("2026-01-03T03:04:05.000Z");
  const source = {
    id: "source-1",
    bookId: "book-1",
    stageId: "stage-1",
    researchArtifactVersionId: "version-1",
    chapterKey: "chapter-1",
    url: "https://example.com/report",
    canonicalUrl: "https://example.com/report",
    title: "Research Report",
    publisher: "Example Institute",
    author: "Jane Researcher",
    publishedAt,
    accessedAt,
    contentType: "report",
    sourceTier: ResearchSourceTier.A,
    tierWeight: new Prisma.Decimal("0.95"),
    isVerified: true,
    verificationStatus: ResearchVerificationStatus.VERIFIED,
    verificationNotes: "Matched source title and excerpt.",
    snapshotPath: "/tmp/snapshot.html",
    extractedTextPath: "/tmp/source.txt",
    metadataJson: { query: "leadership clarity" },
    createdAt: new Date("2026-01-04T03:04:05.000Z"),
    updatedAt: new Date("2026-01-05T03:04:05.000Z"),
  };

  const normalized = normalizeWorkspaceResearchSource(source);

  assert.equal(normalized.id, "source-1");
  assert.equal(normalized.publishedAt, publishedAt.toISOString());
  assert.equal(normalized.accessedAt, accessedAt.toISOString());
  assert.equal(normalized.sourceTier, "A");
  assert.equal(normalized.tierWeight, 0.95);
  assert.equal(normalized.verificationStatus, "VERIFIED");
  assert.deepEqual(normalized.metadata, { query: "leadership clarity" });
});

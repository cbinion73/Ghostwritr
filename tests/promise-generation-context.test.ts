import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveKnowledgeFallbackCharLimit,
  formatReferenceMaterialsForPrompt,
  formatSetupContextForPrompt,
} from "../src/lib/workflows/promise/generation-context";
import { DEFAULT_BOOK_SETUP_PROFILE } from "../src/lib/book-setup-types";

test("formatSetupContextForPrompt returns a stable empty-state message", () => {
  assert.equal(
    formatSetupContextForPrompt(null),
    "No committed book setup profile is available yet.",
  );
});

test("formatSetupContextForPrompt includes voice blend and production settings", () => {
  const context = formatSetupContextForPrompt({
    ...DEFAULT_BOOK_SETUP_PROFILE,
    workingTitle: "Better Decisions",
    writerPersona: "Blended strategist",
    writerPersonaBlend: [
      {
        personaId: "drucker",
        personaName: "Drucker",
        personaSlug: "drucker",
        percentInfluence: 60,
        traits: ["precise"],
        signaturePatterns: ["principle then implication"],
      },
      {
        personaId: "muted",
        personaName: "Muted",
        personaSlug: "muted",
        percentInfluence: 0,
        traits: ["ignored"],
        signaturePatterns: ["ignored"],
      },
    ],
    writerPersonaGuidance: ["clear", "practical"],
    targetWordCount: 40000,
    wordCountTolerance: 2500,
    trimSize: "6x9",
    outputFormats: ["PRINT", "EBOOK"],
    voiceReferenceNotes: ["plainspoken"],
    notesToSystem: ["no fluff"],
  });

  assert.match(context, /Working title: Better Decisions/);
  assert.match(context, /Drucker \(60%\): traits: precise; patterns: principle then implication/);
  assert.doesNotMatch(context, /Muted/);
  assert.match(context, /Target word count: 40000/);
  assert.match(context, /Output formats: PRINT, EBOOK/);
});

test("formatReferenceMaterialsForPrompt renders empty and numbered source material states", () => {
  assert.equal(
    formatReferenceMaterialsForPrompt([]),
    "No uploaded reference materials are available for the Promise stage.",
  );
  assert.equal(
    formatReferenceMaterialsForPrompt([
      { id: "1", title: "Notes", mimeType: "text/plain", note: "Use for voice" },
      { id: "2", title: "Deck", mimeType: "application/pdf", note: "" },
    ]),
    "1. Notes (text/plain) - Use for voice\n2. Deck (application/pdf)",
  );
});

test("deriveKnowledgeFallbackCharLimit bounds fallback context size", () => {
  assert.equal(deriveKnowledgeFallbackCharLimit(), 30000);
  assert.equal(deriveKnowledgeFallbackCharLimit("audience", 1), 6000);
  assert.equal(deriveKnowledgeFallbackCharLimit("audience", 4), 10000);
  assert.equal(deriveKnowledgeFallbackCharLimit("audience", 99), 16000);
});

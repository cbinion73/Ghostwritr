"use server";

import { revalidatePath } from "next/cache";

import type { BaseStoryFormatPreference, BookFormatTarget } from "@/lib/book-setup-types";
import { getWriterPersonaById } from "@/lib/repositories/writer-personas";
import { saveBookSetupWorkflow, commitBookSetupWorkflow } from "@/lib/workflows/book-setup";

function toStringList(value: FormDataEntryValue | FormDataEntryValue[] | null) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  return String(value)
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function saveBookSetupAction(slug: string, formData: FormData) {
  const outputFormats = formData.getAll("outputFormats").map((value) => String(value)) as BookFormatTarget[];
  const requestedWriterPersonaId = String(formData.get("writerPersonaId") ?? "").trim();
  const customWriterPersona = String(formData.get("writerPersonaCustom") ?? "").trim();
  const selectedPersona =
    requestedWriterPersonaId && requestedWriterPersonaId !== "CUSTOM"
      ? await getWriterPersonaById(requestedWriterPersonaId)
      : null;
  const resolvedWriterPersonaName =
    selectedPersona?.name || customWriterPersona || "Default Ghostwriter";
  const writerPersonaGuidance = selectedPersona
    ? [
        selectedPersona.description,
        selectedPersona.voiceTraits.length > 0
          ? `Voice traits: ${selectedPersona.voiceTraits.join(", ")}`
          : null,
        selectedPersona.signaturePatterns.length > 0
          ? `Signature patterns: ${selectedPersona.signaturePatterns.join(" | ")}`
          : null,
        selectedPersona.avoidPatterns.length > 0
          ? `Avoid patterns: ${selectedPersona.avoidPatterns.join(" | ")}`
          : null,
        selectedPersona.samples.filter((sample) => sample.useForInspiration).length > 0
          ? `Inspiration samples: ${selectedPersona.samples
              .filter((sample) => sample.useForInspiration)
              .map((sample) => sample.title)
              .join(" | ")}`
          : null,
        "Use persona materials for inspiration only. Do not copy phrases, structure, or distinctive passages.",
      ].filter((value): value is string => Boolean(value))
    : [];

  await saveBookSetupWorkflow(slug, {
    writerPersonaId: selectedPersona?.id ?? null,
    writerPersonaGuidance,
    workingTitle: String(formData.get("workingTitle") ?? "").trim(),
    subtitle: String(formData.get("subtitle") ?? "").trim() || null,
    writerPersona: resolvedWriterPersonaName,
    baseStoryFormatPreference:
      (String(formData.get("baseStoryFormatPreference") ?? "AUTO").trim() ||
        "AUTO") as BaseStoryFormatPreference,
    voiceReferenceNotes: toStringList(formData.get("voiceReferenceNotes")),
    targetWordCount: Number(formData.get("targetWordCount") ?? 45000),
    wordCountTolerance: Number(formData.get("wordCountTolerance") ?? 2500),
    targetPageCount: Number(formData.get("targetPageCount") ?? 0) || null,
    trimSize: String(formData.get("trimSize") ?? "6 x 9 in").trim(),
    outputFormats: outputFormats.length > 0 ? outputFormats : ["PRINT", "EBOOK"],
    aiAuthorshipGuardEnabled: formData.get("aiAuthorshipGuardEnabled") === "on",
    provenanceTrackingEnabled: formData.get("provenanceTrackingEnabled") === "on",
    marketingHandoffEnabled: formData.get("marketingHandoffEnabled") === "on",
    notesToSystem: toStringList(formData.get("notesToSystem")),
  });

  revalidatePath(`/books/${slug}/setup`);
  revalidatePath(`/books/${slug}/promise`);
}

export async function commitBookSetupAction(slug: string) {
  await commitBookSetupWorkflow(slug);
  revalidatePath(`/books/${slug}/setup`);
  revalidatePath(`/books/${slug}/promise`);
}

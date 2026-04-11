"use server";

import { revalidatePath } from "next/cache";

import {
  createWriterPersona,
  deleteWriterPersona,
  deleteWriterPersonaSample,
  setWriterPersonaSampleInspiration,
  updateWriterPersona,
} from "@/lib/repositories/writer-personas";

function toStringList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function createWriterPersonaAction(formData: FormData) {
  await createWriterPersona({
    name: String(formData.get("name") ?? "").trim() || "Untitled Persona",
    description: String(formData.get("description") ?? "").trim(),
    voiceTraits: toStringList(formData.get("voiceTraits")),
    signaturePatterns: toStringList(formData.get("signaturePatterns")),
    avoidPatterns: toStringList(formData.get("avoidPatterns")),
    sampleExcerpt: String(formData.get("sampleExcerpt") ?? "").trim() || null,
  });

  revalidatePath("/personas");
  revalidatePath("/");
}

export async function updateWriterPersonaAction(formData: FormData) {
  await updateWriterPersona({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? "").trim() || "Untitled Persona",
    description: String(formData.get("description") ?? "").trim(),
    voiceTraits: toStringList(formData.get("voiceTraits")),
    signaturePatterns: toStringList(formData.get("signaturePatterns")),
    avoidPatterns: toStringList(formData.get("avoidPatterns")),
    sampleExcerpt: String(formData.get("sampleExcerpt") ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
  });

  revalidatePath("/personas");
  revalidatePath("/");
}

export async function deleteWriterPersonaAction(formData: FormData) {
  await deleteWriterPersona(String(formData.get("id") ?? ""));
  revalidatePath("/personas");
  revalidatePath("/");
}

export async function toggleWriterPersonaSampleAction(formData: FormData) {
  await setWriterPersonaSampleInspiration(
    String(formData.get("sampleId") ?? ""),
    String(formData.get("useForInspiration") ?? "false") === "true",
  );
  revalidatePath("/personas");
}

export async function deleteWriterPersonaSampleAction(formData: FormData) {
  await deleteWriterPersonaSample(String(formData.get("sampleId") ?? ""));
  revalidatePath("/personas");
}

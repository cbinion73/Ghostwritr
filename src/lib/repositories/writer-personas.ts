import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

import type { Prisma } from "@prisma/client";

import { db } from "../db";

const PERSONA_LIBRARY_ROOT = path.join(process.cwd(), "reference-library", "personas");

type WriterPersonaSeed = {
  slug: string;
  name: string;
  description: string;
  voiceTraits: string[];
  signaturePatterns: string[];
  avoidPatterns: string[];
  sampleExcerpt?: string;
};

const DEFAULT_WRITER_PERSONAS: WriterPersonaSeed[] = [
  {
    slug: "clear-strategic-ghostwriter",
    name: "Clear Strategic Ghostwriter",
    description:
      "Sharp, credible nonfiction for professionals who want clear thinking, strong synthesis, and useful practical structure.",
    voiceTraits: ["clear", "grounded", "strategic", "credible", "economical"],
    signaturePatterns: [
      "opens with tension rather than fluff",
      "moves from confusion to clarity",
      "uses examples to prove a point, not decorate it",
    ],
    avoidPatterns: ["consultant jargon", "inspirational vagueness", "AI-sounding filler"],
  },
  {
    slug: "warm-narrative-guide",
    name: "Warm Narrative Guide",
    description:
      "A humane, story-led explanatory voice that teaches through scenes, emotional intelligence, and concrete reflection.",
    voiceTraits: ["warm", "narrative", "empathetic", "observant", "clear"],
    signaturePatterns: [
      "uses scene-setting without overwriting",
      "balances lived detail and practical takeaway",
      "keeps the reader feeling seen",
    ],
    avoidPatterns: ["clinical coldness", "melodrama", "copied memoir cadence"],
  },
  {
    slug: "investigative-synthesist",
    name: "Investigative Synthesist",
    description:
      "Research-forward nonfiction that feels rigorous, current, and intellectually honest without becoming dry.",
    voiceTraits: ["rigorous", "analytic", "current", "precise", "plainspoken"],
    signaturePatterns: [
      "tests claims against evidence",
      "surfaces contradiction and nuance",
      "lets facts sharpen the prose",
    ],
    avoidPatterns: ["sweeping certainty", "unearned certainty", "academic throat-clearing"],
  },
  {
    slug: "provocative-executive-voice",
    name: "Provocative Executive Voice",
    description:
      "A confident, decisive business voice that challenges assumptions and writes with authority, pressure, and edge.",
    voiceTraits: ["decisive", "incisive", "energetic", "commercial", "bold"],
    signaturePatterns: [
      "gets to the point quickly",
      "turns abstractions into choices and tradeoffs",
      "uses pressure and stakes to drive momentum",
    ],
    avoidPatterns: ["empty swagger", "clickbait provocation", "recycled thought-leadership clichés"],
  },
];

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
}

export function normalizeWriterPersonaRecord(
  persona: {
    id: string;
    slug: string;
    name: string;
    description: string;
    voiceTraitsJson: unknown;
    signaturePatternsJson: unknown;
    avoidPatternsJson: unknown;
    sampleExcerpt: string | null;
    isBuiltIn: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    samples?: Array<{
      id: string;
      title: string;
      mimeType: string;
      note: string | null;
      originalFileName: string | null;
      byteSize: number;
      useForInspiration: boolean;
      createdAt: Date;
    }>;
  },
) {
  return {
    id: persona.id,
    slug: persona.slug,
    name: persona.name,
    description: persona.description,
    voiceTraits: parseStringArray(persona.voiceTraitsJson),
    signaturePatterns: parseStringArray(persona.signaturePatternsJson),
    avoidPatterns: parseStringArray(persona.avoidPatternsJson),
    sampleExcerpt: persona.sampleExcerpt,
    isBuiltIn: persona.isBuiltIn,
    isActive: persona.isActive,
    createdAt: persona.createdAt,
    updatedAt: persona.updatedAt,
    samples:
      persona.samples?.map((sample) => ({
        id: sample.id,
        title: sample.title,
        mimeType: sample.mimeType,
        note: sample.note,
        originalFileName: sample.originalFileName,
        byteSize: sample.byteSize,
        useForInspiration: sample.useForInspiration,
        createdAt: sample.createdAt,
      })) ?? [],
  };
}

export function formatWriterPersonaForPrompt(
  persona:
    | ReturnType<typeof normalizeWriterPersonaRecord>
    | null
    | undefined,
) {
  if (!persona) {
    return "No structured writer persona is selected.";
  }

  const inspirationSamples = persona.samples
    .filter((sample) => sample.useForInspiration)
    .map((sample) => sample.title);

  return [
    `Selected persona: ${persona.name}`,
    `Description: ${persona.description}`,
    `Voice traits: ${persona.voiceTraits.join(", ") || "None provided"}`,
    `Signature patterns: ${persona.signaturePatterns.join(" | ") || "None provided"}`,
    `Avoid patterns: ${persona.avoidPatterns.join(" | ") || "None provided"}`,
    `Sample excerpt: ${persona.sampleExcerpt ?? "None provided"}`,
    `Inspiration files: ${inspirationSamples.join(" | ") || "None uploaded"}`,
    "Use these materials for inspiration only. Do not copy phrasing, structure, or distinctive passages.",
  ].join("\n");
}

export async function ensureDefaultWriterPersonas() {
  await Promise.all(
    DEFAULT_WRITER_PERSONAS.map((persona) =>
      db.writerPersona.upsert({
        where: { slug: persona.slug },
        update: {
          isBuiltIn: true,
          isActive: true,
        },
        create: {
          slug: persona.slug,
          name: persona.name,
          description: persona.description,
          voiceTraitsJson: persona.voiceTraits as Prisma.InputJsonValue,
          signaturePatternsJson: persona.signaturePatterns as Prisma.InputJsonValue,
          avoidPatternsJson: persona.avoidPatterns as Prisma.InputJsonValue,
          sampleExcerpt: persona.sampleExcerpt ?? null,
          isBuiltIn: true,
          isActive: true,
        },
      }),
    ),
  );
}

export async function listWriterPersonas() {
  await ensureDefaultWriterPersonas();

  const personas = await db.writerPersona.findMany({
    include: {
      samples: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
  });

  return personas.map(normalizeWriterPersonaRecord);
}

export async function getWriterPersonaById(personaId: string) {
  const persona = await db.writerPersona.findUnique({
    where: { id: personaId },
    include: {
      samples: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return persona ? normalizeWriterPersonaRecord(persona) : null;
}

export async function createWriterPersona(input: {
  name: string;
  description: string;
  voiceTraits: string[];
  signaturePatterns: string[];
  avoidPatterns: string[];
  sampleExcerpt?: string | null;
}) {
  const baseSlug = sanitizeFileSegment(input.name.toLowerCase()) || `persona-${randomUUID()}`;
  const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;

  const persona = await db.writerPersona.create({
    data: {
      slug,
      name: input.name,
      description: input.description,
      voiceTraitsJson: input.voiceTraits as Prisma.InputJsonValue,
      signaturePatternsJson: input.signaturePatterns as Prisma.InputJsonValue,
      avoidPatternsJson: input.avoidPatterns as Prisma.InputJsonValue,
      sampleExcerpt: input.sampleExcerpt ?? null,
      isBuiltIn: false,
      isActive: true,
    },
    include: {
      samples: true,
    },
  });

  return normalizeWriterPersonaRecord(persona);
}

export async function updateWriterPersona(input: {
  id: string;
  name: string;
  description: string;
  voiceTraits: string[];
  signaturePatterns: string[];
  avoidPatterns: string[];
  sampleExcerpt?: string | null;
  isActive: boolean;
}) {
  const persona = await db.writerPersona.update({
    where: { id: input.id },
    data: {
      name: input.name,
      description: input.description,
      voiceTraitsJson: input.voiceTraits as Prisma.InputJsonValue,
      signaturePatternsJson: input.signaturePatterns as Prisma.InputJsonValue,
      avoidPatternsJson: input.avoidPatterns as Prisma.InputJsonValue,
      sampleExcerpt: input.sampleExcerpt ?? null,
      isActive: input.isActive,
    },
    include: {
      samples: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return normalizeWriterPersonaRecord(persona);
}

export async function deleteWriterPersona(id: string) {
  const persona = await db.writerPersona.findUniqueOrThrow({
    where: { id },
  });

  if (persona.isBuiltIn) {
    throw new Error("Built-in personas cannot be deleted.");
  }

  await db.writerPersona.delete({
    where: { id },
  });
}

export async function uploadWriterPersonaSample(input: {
  writerPersonaId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  note?: string;
  useForInspiration?: boolean;
}) {
  const uploadId = randomUUID();
  const safeFileName = sanitizeFileSegment(input.fileName || "sample");
  const relativeStoragePath = path.join(
    sanitizeFileSegment(input.writerPersonaId),
    `${uploadId}-${safeFileName}`,
  );
  const absoluteStoragePath = path.join(PERSONA_LIBRARY_ROOT, relativeStoragePath);

  await mkdir(path.dirname(absoluteStoragePath), { recursive: true });
  await writeFile(absoluteStoragePath, input.bytes);

  return db.writerPersonaSample.create({
    data: {
      writerPersonaId: input.writerPersonaId,
      title: input.fileName,
      storagePath: absoluteStoragePath,
      mimeType: input.mimeType || "application/octet-stream",
      note: input.note ?? null,
      originalFileName: input.fileName,
      byteSize: input.bytes.byteLength,
      useForInspiration: input.useForInspiration ?? true,
    },
  });
}

export async function setWriterPersonaSampleInspiration(sampleId: string, useForInspiration: boolean) {
  return db.writerPersonaSample.update({
    where: { id: sampleId },
    data: { useForInspiration },
  });
}

export async function deleteWriterPersonaSample(sampleId: string) {
  return db.writerPersonaSample.delete({
    where: { id: sampleId },
  });
}

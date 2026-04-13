"use client";

import { VoiceBlendingSelector } from "./voice-blending-selector";
import type { WriterPersonaBlend } from "@/lib/book-setup-types";

interface VoiceBlendSectionProps {
  slug: string;
  workingTitle: string;
  baseStoryFormatPreference: string;
  subtitle: string | null;
  initialBlend?: WriterPersonaBlend[];
}

export function VoiceBlendSection({
  slug,
  workingTitle,
  baseStoryFormatPreference,
  subtitle,
  initialBlend,
}: VoiceBlendSectionProps) {
  const handleBlendSelected = (blend: WriterPersonaBlend[]) => {
    // The saveWriterPersonaBlend action is called within VoiceBlendingSelector
    // This callback just receives notification that a blend was selected/saved
    console.log("Blend selected and saved:", blend);
  };

  // Provide meaningful defaults for voice suggestion analysis
  const description = subtitle && subtitle.trim() ? subtitle.trim() : `A book titled "${workingTitle}"`;
  const category = baseStoryFormatPreference && baseStoryFormatPreference !== "AUTO"
    ? baseStoryFormatPreference
    : "General Leadership/Business";

  return (
    <VoiceBlendingSelector
      slug={slug}
      workingTitle={workingTitle}
      category={category}
      description={description}
      onBlendSelected={handleBlendSelected}
      initialBlend={initialBlend}
    />
  );
}

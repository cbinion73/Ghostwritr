import type { CompactPersonalStoryCard } from "./personal-story-contract";
import type { ChapterEvidenceRecord } from "./source-evidence-contract";

export type QuillContextPacket = {
  chapter: {
    chapterKey: string;
    chapterTitle: string;
  };
  approvedBrief: {
    approved: boolean;
    summary: string;
  };
  paragraphOutline: {
    current: boolean;
    paragraphs: Array<{
      id: string;
      topicSentence: string;
      purpose: string;
      wordCountTarget?: number | null;
    }>;
  };
  baseStoryGuidance: {
    present: boolean;
    draftingInstruction: string;
  };
  evidence: {
    research: ChapterEvidenceRecord[];
    externalStories: ChapterEvidenceRecord[];
  };
  personalStories: CompactPersonalStoryCard[];
  voiceGuide: {
    present: boolean;
    dominantPersona?: string | null;
    guidance: string[];
  };
  craftNotes: string[];
};

const FORBIDDEN_CONTEXT_KEYS = new Set([
  "transcript",
  "messages",
  "rawNotes",
  "sourceQuote",
  "provenance",
  "sourceMessageIds",
  "contentText",
]);

function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const currentPath = `${path}.${key}`;
    return [
      ...(FORBIDDEN_CONTEXT_KEYS.has(key) ? [currentPath] : []),
      ...findForbiddenKeys(child, currentPath),
    ];
  });
}

export function validateQuillContextPacket(packet: QuillContextPacket) {
  const issues: string[] = [];

  if (!packet.approvedBrief.approved) {
    issues.push("Approved strategic brief is missing.");
  }
  if (!packet.paragraphOutline.current || packet.paragraphOutline.paragraphs.length === 0) {
    issues.push("Current paragraph outline is missing.");
  }
  if (!packet.baseStoryGuidance.present || !packet.baseStoryGuidance.draftingInstruction.trim()) {
    issues.push("Chapter Base Story guidance is missing.");
  }
  if (packet.evidence.research.some((record) => record.admissibility !== "ADMISSIBLE")) {
    issues.push("Research evidence includes non-admissible records.");
  }
  if (packet.evidence.externalStories.some((record) => record.admissibility !== "ADMISSIBLE")) {
    issues.push("External story evidence includes non-admissible records.");
  }
  if (packet.personalStories.some((story) => story.permissionStatus !== "granted")) {
    issues.push("Personal story context includes a story without granted permission.");
  }
  if (!packet.voiceGuide.present) {
    issues.push("Voice guide is missing.");
  }

  const forbiddenKeys = findForbiddenKeys(packet);
  if (forbiddenKeys.length > 0) {
    issues.push(`Forbidden raw context fields present: ${forbiddenKeys.join(", ")}`);
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

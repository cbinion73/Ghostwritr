import type { StageKey, StageStatus } from "@prisma/client";

export type ChatMessage = {
  role: "user" | "agent";
  content: string;
  streaming?: boolean;
};

export type ArtifactDraft = {
  type: string;
  title: string;
  content: string;
};

export type DossierChapter = {
  title: string;
  status: "saved" | "pending";
};

export type DossierData = {
  dossiers: Array<{ id: string; title: string }>;
  outlineContent: string | null;
};

export interface AgentChatPanelProps {
  slug: string;
  stageKey: StageKey;
  stageLabel: string;
  stageRoute: string;
  status: StageStatus;
  artifactCount: number;
  bookTitle: string;
  committedContent?: string | null;
  onStageAdvance?: (key: StageKey) => void;
  dossierMode?: boolean;
  persistChat?: boolean;
}

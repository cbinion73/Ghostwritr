import { ArtifactType } from "@prisma/client";

import { getLatestEditingArtifactVersion } from "./repositories/editing-artifacts";
import { buildSourceDraftSignature } from "./workflows/editing/revision-support";
import {
  evaluatePublicationPassReport,
  PublicationPassReportSchema,
} from "./workflows/editing/publication-pass";
import { ManuscriptAssemblySchema } from "./workflows/editing/workspace-schemas";

export const PUBLICATION_PASS_PROOF_NOTICE = "PROOF ONLY — PUBLICATION PASS INCOMPLETE — NOT FOR PUBLICATION";

export async function getPublicationPassGate(bookId: string) {
  const [assemblyVersion, reportVersion] = await Promise.all([
    getLatestEditingArtifactVersion(bookId, ArtifactType.MANUSCRIPT_ASSEMBLY),
    getLatestEditingArtifactVersion(bookId, ArtifactType.EDITORIAL_REVIEW),
  ]);
  const assembly = ManuscriptAssemblySchema.safeParse(assemblyVersion?.contentJson).data ?? null;
  const report = PublicationPassReportSchema.safeParse(reportVersion?.contentJson).data ?? null;
  const currentSignature = assembly ? buildSourceDraftSignature(assembly.chapters) : "";
  const evaluation = evaluatePublicationPassReport(report, currentSignature);
  return {
    ready: evaluation.status === "ready",
    status: evaluation.status,
    blockers: evaluation.blockers,
    report,
  };
}

export async function requirePublicationPassReady(bookId: string, proofMode = false) {
  const gate = await getPublicationPassGate(bookId);
  if (!gate.ready && !proofMode) {
    throw new Error(`PUBLICATION_PASS_BLOCKED: ${gate.blockers.join(" ")}`);
  }
  return {
    ...gate,
    proofOnly: !gate.ready,
    proofNotice: gate.ready ? null : PUBLICATION_PASS_PROOF_NOTICE,
  };
}

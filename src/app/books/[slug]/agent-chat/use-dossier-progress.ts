import { useEffect, useState } from "react";

import { fetchJson } from "@/lib/ui/client-request";
import { parseOutlineChapters } from "./dossier-checklist";
import type { DossierChapter, DossierData } from "./types";

export function useDossierProgress({ slug, enabled, artifactCount }: {
  slug: string;
  enabled: boolean;
  artifactCount: number;
}) {
  const [savedCount, setSavedCount] = useState(artifactCount);
  const [chapters, setChapters] = useState<DossierChapter[]>([]);

  const refresh = async () => {
    if (!enabled) return;
    try {
      const data = await fetchJson<DossierData>(`/api/books/${slug}/stage-artifacts/dossiers`);
      const savedTitles = new Set(data.dossiers.map((dossier) => dossier.title.toLowerCase()));
      setChapters(parseOutlineChapters(data.outlineContent ?? "").map((title) => ({
        title,
        status: savedTitles.has(title.toLowerCase()) ? "saved" : "pending",
      })));
    } catch {
      // Dossier progress is supplemental and retries after the next save.
    }
  };

  useEffect(() => setSavedCount(artifactCount), [artifactCount]);
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, enabled]);

  return { chapters, savedCount, setSavedCount, refresh };
}

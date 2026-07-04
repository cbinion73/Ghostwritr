"use client";

import { useEffect, useRef } from "react";
import type { StageKey, StageStatus } from "@prisma/client";

/**
 * Fires a browser notification when a stage transitions to
 * READY_FOR_REVIEW, when a stage commits while the tab is in the
 * background, or when a Morning Report arrives. Renders nothing.
 *
 * The Studio already polls (router.refresh) while stages run, so this
 * component sees fresh props on every poll and only needs to diff.
 */
export function ReviewNotifier({
  stages,
  hasMorningReport,
  bookTitle,
}: {
  stages: Array<{ key: StageKey; label: string; status: StageStatus }>;
  hasMorningReport: boolean;
  bookTitle: string;
}) {
  const previous = useRef<Map<StageKey, StageStatus> | null>(null);
  const reportSeen = useRef(hasMorningReport);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    // Ask once, lazily, only when there is something running worth watching.
    const anyRunning = stages.some((s) => s.status === "IN_PROGRESS");
    if (anyRunning && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [stages]);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      previous.current = new Map(stages.map((s) => [s.key, s.status]));
      reportSeen.current = hasMorningReport;
      return;
    }

    const prior = previous.current;
    if (prior) {
      for (const stage of stages) {
        const before = prior.get(stage.key);
        if (!before || before === stage.status) continue;
        if (stage.status === "READY_FOR_REVIEW") {
          new Notification(`${bookTitle}: ${stage.label} is ready for review`, {
            body: "The agent finished its pass. Open the Studio to review and commit.",
            tag: `ghostwritr-${stage.key}`,
          });
        } else if (stage.status === "BLOCKED") {
          new Notification(`${bookTitle}: ${stage.label} is blocked`, {
            body: "The stage stopped and needs your attention.",
            tag: `ghostwritr-${stage.key}`,
          });
        }
      }
    }

    if (hasMorningReport && !reportSeen.current) {
      new Notification(`${bookTitle}: Morning Report is ready`, {
        body: "The overnight build finished. Open the Studio for the digest.",
        tag: "ghostwritr-morning-report",
      });
    }

    previous.current = new Map(stages.map((s) => [s.key, s.status]));
    reportSeen.current = hasMorningReport;
  }, [stages, hasMorningReport, bookTitle]);

  return null;
}

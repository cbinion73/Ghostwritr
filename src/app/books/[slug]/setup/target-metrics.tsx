"use client";

import { useState } from "react";
import { estimateWordsPerPage } from "@/lib/manuscript-metrics";

function toPositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function TargetMetricsFields({
  targetWordCount,
  wordCountTolerance,
  targetPageCount,
  trimSize,
}: {
  targetWordCount: number;
  wordCountTolerance: number;
  targetPageCount: number | null;
  trimSize: string;
}) {
  const wordsPerPage = estimateWordsPerPage(trimSize);
  const initialPages =
    targetPageCount ?? Math.max(1, Math.round(targetWordCount / wordsPerPage));

  const [wordCount, setWordCount] = useState(String(targetWordCount));
  const [pageCount, setPageCount] = useState(String(initialPages));

  return (
    <div className="target-grid">
      <label className="form-field">
        <span className="field-label">Target Word Count</span>
        <input
          className="editor-input"
          name="targetWordCount"
          onChange={(event) => {
            const nextWordCount = event.target.value;
            setWordCount(nextWordCount);

            const parsedWordCount = toPositiveNumber(nextWordCount);
            if (parsedWordCount) {
              setPageCount(String(Math.max(1, Math.round(parsedWordCount / wordsPerPage))));
            }
          }}
          placeholder="45000"
          type="number"
          value={wordCount}
        />
      </label>

      <label className="form-field">
        <span className="field-label">Word Count Tolerance</span>
        <input
          className="editor-input"
          defaultValue={wordCountTolerance}
          name="wordCountTolerance"
          placeholder="2500"
          type="number"
        />
      </label>

      <label className="form-field">
        <span className="field-label">Target Page Count</span>
        <input
          className="editor-input"
          name="targetPageCount"
          onChange={(event) => {
            const nextPageCount = event.target.value;
            setPageCount(nextPageCount);

            const parsedPageCount = toPositiveNumber(nextPageCount);
            if (parsedPageCount) {
              setWordCount(String(Math.max(wordsPerPage, parsedPageCount * wordsPerPage)));
            }
          }}
          placeholder="180"
          type="number"
          value={pageCount}
        />
      </label>

      <div className="form-help" style={{ gridColumn: "1 / -1" }}>
        Estimated using about {wordsPerPage} words per page for the current trim size.
        This is a planning target, not final typeset pagination.
      </div>
    </div>
  );
}

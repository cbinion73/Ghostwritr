import { getLLMCallContext, runWithLLMContext } from "../../llm/call-context";

export function runWithResearchChapterAttribution<T>(
  chapterKey: string,
  operation: () => Promise<T>,
) {
  const outer = getLLMCallContext();
  if (outer) {
    return runWithLLMContext({ ...outer, chapterKey }, operation);
  }
  return operation();
}

import { z } from "zod";

export const InterviewReplySchema = z.object({ reply: z.string() });

export const EncyclopediaSchema = z.object({
  interviewFocus: z.string(),
  nextQuestion: z.string(),
  entries: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    lesson: z.string(),
    whyItMatters: z.string(),
    storyType: z.enum(["origin", "turning_point", "failure", "recovery", "leadership", "conflict", "identity", "moral", "micro_story", "observation"]),
    lifeArea: z.string(),
    emotionalNotes: z.array(z.string()).default([]),
    chapterFitHints: z.array(z.string()).default([]),
    status: z.enum(["candidate", "strong", "needs_detail", "not_applicable"]),
    sourceQuote: z.string().nullable().optional(),
  })).default([]),
  noStoryTopics: z.array(z.string()).default([]),
  coverageGaps: z.array(z.string()).default([]),
  interviewerNotes: z.array(z.string()).default([]),
});

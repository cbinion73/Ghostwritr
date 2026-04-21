---
project_name: 'ghostwritr'
user_name: 'Chris'
date: '2026-04-20'
sections_completed: ['technology_stack']
existing_patterns_found: 15
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

_Documented after discovery phase_

- **Runtime/Framework:** Next.js `^16.2.1` (App Router), React `^19.2.4`, Node types `^25.5.0`
- **Language:** TypeScript `^6.0.2`, strict mode ON, target ES2017, path alias `@/*` → `./src/*`
- **Database:** PostgreSQL via Prisma `^6.16.2` (@prisma/client `^6.16.2`)
- **LLM Orchestration:** LangGraph `@langchain/langgraph ^1.2.6`, LangChain core `^1.0.6`, `langchain ^1.2.37`
- **LLM Providers:**
  - `@langchain/anthropic ^1.0.0` (Claude Opus/Sonnet/Haiku)
  - `@langchain/openai ^1.3.1` (GPT-5, GPT-5.4)
  - `@langchain/google-genai ^1.0.0`, `@google/generative-ai ^0.12.0` (Gemini 2.5 Pro)
- **Validation:** Zod `^4.3.6`
- **Document Extraction:** `mammoth ^1.12.0` (docx), `pdfjs-dist ^5.6.205`
- **Testing:** None configured (no Jest/Vitest/Playwright)
- **Linting/Formatting:** No ESLint or Prettier configs — Next.js/TS defaults only

## Critical Implementation Rules

_Documented after discovery phase_

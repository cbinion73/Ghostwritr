import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const relative = join(dir, entry);
    const absolute = join(root, relative);
    return statSync(absolute).isDirectory() ? listFiles(relative) : [relative];
  });
}

const bookRouteFiles = listFiles("src/app/api/books/[slug]")
  .filter((path) => path.endsWith("/route.ts"))
  .sort();

function resolveRouteOwner(path: string): string {
  const source = read(path);
  const reExport = source.match(/^export \{[^}]+} from "([^"]+)";/m);
  if (!reExport?.[1]) return path;
  const reExportTarget = reExport[1].endsWith("/route")
    ? `${reExport[1]}.ts`
    : join(reExport[1], "route.ts");
  const ownerPath = join(dirname(path), reExportTarget).replaceAll("\\", "/");
  return existsSync(join(root, ownerPath)) ? ownerPath : path;
}

test("middleware protects app API namespaces with explicit app authentication", () => {
  const middleware = read("src/middleware.ts");

  assert.ok(middleware.includes('"/api/books/:path*"'));
  assert.ok(middleware.includes('"/api/personas/:path*"'));
  assert.ok(middleware.includes("getLocalAuthConfig()"));
  assert.ok(middleware.includes("unauthorizedResponse(request)"));
  assert.ok(middleware.includes("APP_USER_EMAIL_HEADER"));
  assert.ok(middleware.includes("APP_AUTH_MODE_HEADER"));
});

test("book-scoped API routes require app auth and ownership-aware book lookup", () => {
  const offenders = bookRouteFiles
    .map((path) => ({ path, owner: resolveRouteOwner(path) }))
    .filter(({ owner }) => {
      const source = read(owner);
      return !source.includes("requireAuthenticatedAppUser")
        || !source.includes("getBookHeaderBySlugForUserOrThrow");
    })
    .map(({ path }) => path);

  assert.deepEqual(offenders, []);
});

test("archive import API assigns imported books to the authenticated user", () => {
  const route = read("src/app/api/books/import-archive/route.ts");
  const importer = read("src/lib/book-archive-import.ts");

  assert.ok(route.includes("requireAuthenticatedAppUser"));
  assert.ok(route.includes("const user = await requireAuthenticatedAppUser();"));
  assert.ok(route.includes("ownerUserId: user.id"));
  assert.ok(importer.includes("ownerUserId?: string"));
  assert.ok(importer.includes("input.ownerUserId != null"));
  assert.ok(importer.includes("ownerUserId: owner.id"));
});

test("mutating JSON APIs parse bounded request bodies before validation", () => {
  const routes = [
    "src/app/api/books/[slug]/agent-chat/route.ts",
    "src/app/api/books/[slug]/stage-artifacts/commit/route.ts",
    "src/app/api/books/[slug]/stage-artifacts/approve/route.ts",
    "src/app/api/books/[slug]/chapter-draft/run/route.ts",
    "src/app/api/books/[slug]/source-docs/route.ts",
    "src/app/api/internal/workflow-runs/process/route.ts",
  ];

  for (const routePath of routes) {
    const source = read(routePath);
    assert.ok(source.includes("parseLimitedJson"), `${routePath} must use bounded JSON parsing`);
    assert.ok(source.includes("RequestLimitError"), `${routePath} must translate request limit errors`);
    assert.ok(source.includes("requestLimitResponse"), `${routePath} must return request limit responses`);
  }
});

test("upload APIs enforce content-length, file-size, file-count, and expanded archive limits", () => {
  const sourceDocs = read("src/app/api/books/[slug]/source-docs/route.ts");
  const archiveImport = read("src/app/api/books/import-archive/route.ts");
  const personaSamples = read("src/app/api/personas/[personaId]/samples/route.ts");

  assert.ok(sourceDocs.includes("assertContentLengthWithinLimit"));
  assert.ok(sourceDocs.includes("REQUEST_LIMITS.sourceDocumentBytes"));
  assert.ok(sourceDocs.includes("assertFileWithinLimit"));

  assert.ok(archiveImport.includes("assertContentLengthWithinLimit"));
  assert.ok(archiveImport.includes("REQUEST_LIMITS.archiveBytes"));
  assert.ok(archiveImport.includes("assertFileWithinLimit"));
  assert.ok(archiveImport.includes("REQUEST_LIMITS.expandedArchiveBytes"));

  assert.ok(personaSamples.includes("assertContentLengthWithinLimit"));
  assert.ok(personaSamples.includes("REQUEST_LIMITS.personaSampleBytes"));
  assert.ok(personaSamples.includes("assertFileCountWithinLimit"));
  assert.ok(personaSamples.includes("assertFileWithinLimit"));
});

test("generation APIs enforce per-book rate limits before provider work", () => {
  const routes = [
    "src/app/api/books/[slug]/agent-chat/route.ts",
    "src/app/api/books/[slug]/scout-research/route.ts",
    "src/app/api/books/[slug]/chronicle-stories/route.ts",
    "src/app/api/books/[slug]/workbook-design/route.ts",
  ];

  for (const routePath of routes) {
    const source = read(routePath);
    assert.ok(source.includes("assertRateLimit"), `${routePath} must enforce rate limits`);
    assert.ok(source.includes("REQUEST_LIMITS.generationRequestsPerWindow"), `${routePath} must use generation window limit`);
    assert.ok(source.includes("REQUEST_LIMITS.apiWindowMs"), `${routePath} must use API window`);
  }
});

test("API validation rejects missing or unsupported mutation fields", () => {
  const runRoute = read("src/app/api/books/[slug]/chapter-draft/run/route.ts");
  const commitRoute = read("src/app/api/books/[slug]/stage-artifacts/commit/route.ts");
  const approveRoute = read("src/app/api/books/[slug]/stage-artifacts/approve/route.ts");
  const sourceDocsRoute = read("src/app/api/books/[slug]/source-docs/route.ts");
  const workflowProcessRoute = read("src/app/api/internal/workflow-runs/process/route.ts");

  assert.ok(runRoute.includes("isRunAction"));
  assert.ok(runRoute.includes("Unsupported Chapter Draft run action."));
  assert.ok(runRoute.includes("chapterKey is required"));
  assert.ok(commitRoute.includes("Missing stageKey or artifact"));
  assert.ok(approveRoute.includes("Missing stageKey"));
  assert.ok(sourceDocsRoute.includes("No file provided"));
  assert.ok(sourceDocsRoute.includes("Label is required"));
  assert.ok(sourceDocsRoute.includes("documentId required"));
  assert.ok(workflowProcessRoute.includes("Missing runId"));
});

test("durable run APIs are idempotent by reusing active stage runs", () => {
  const chapterDraftJobs = read("src/lib/workflows/chapter-draft/jobs.ts");
  const researchJobs = read("src/lib/workflows/research/jobs.ts");
  const workflowRuns = read("src/lib/repositories/workflow-runs.ts");
  const runRoute = read("src/app/api/books/[slug]/chapter-draft/run/route.ts");

  assert.ok(runRoute.includes("enqueueAndTriggerChapterDraftWorkflow"));
  assert.ok(chapterDraftJobs.includes("getActiveWorkflowRunForStage(book.id, StageKey.CHAPTER_DRAFT)"));
  assert.ok(chapterDraftJobs.includes("if (existing)"));
  assert.ok(chapterDraftJobs.includes("return existing"));
  assert.ok(researchJobs.includes("getActiveWorkflowRunForStage(book.id, StageKey.RESEARCH)"));
  assert.ok(researchJobs.includes("if (existingRun)"));
  assert.ok(researchJobs.includes("return existingRun"));
  assert.ok(workflowRuns.includes("bookId_stageId_idempotencyKey"));
  assert.ok(workflowRuns.includes("if (existing) return existing"));
});

test("source and citation mutation routes are bounded, ownership scoped, and stale-safe", () => {
  for (const routePath of [
    "src/app/api/books/[slug]/source-review/route.ts",
    "src/app/api/books/[slug]/citation-audit/route.ts",
  ]) {
    const source = read(routePath);
    assert.ok(source.includes("requireAuthenticatedAppUser"), routePath);
    assert.ok(source.includes("getBookHeaderBySlugForUserOrThrow"), routePath);
    assert.ok(source.includes("parseLimitedJson"), routePath);
    assert.ok(source.includes("409"), routePath);
  }
});

test("every final manuscript route executes citation and publication-pass gates before document generation", () => {
  for (const routePath of [
    "src/app/api/books/[slug]/manuscript-export/route.ts",
    "src/app/api/books/[slug]/publish-package/route.ts",
    "src/app/api/books/[slug]/workspace-export/route.ts",
  ]) {
    const source = read(routePath);
    const gate = source.indexOf("requirePublicationCitationReady");
    assert.ok(gate >= 0, `${routePath} must execute the shared citation gate`);
    const publicationPassGate = source.indexOf("requirePublicationPassReady");
    assert.ok(publicationPassGate >= 0, `${routePath} must execute the shared Publication Pass gate`);
    const firstGenerator = Math.min(...["buildKdpDocx", "buildKdpPdfFromHtml", "buildManuscriptMarkdown", "writeFile("]
      .map((needle) => source.indexOf(needle, gate + 1))
      .filter((index) => index >= 0));
    assert.ok(Number.isFinite(firstGenerator), `${routePath} must generate an output after the gate`);
    assert.ok(gate < firstGenerator, `${routePath} must gate before output generation`);
    assert.ok(publicationPassGate < firstGenerator, `${routePath} must run Publication Pass gate before output generation`);
    assert.ok(source.includes('searchParams.get("mode") === "proof"'), `${routePath} must require explicit proof mode`);
  }
});

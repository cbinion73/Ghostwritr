# GHOSTWRITR End-to-End Test Battery

## Purpose

This battery verifies the live GHOSTWRITR product from four angles:

1. workflow contracts and schema integrity
2. quality-enforcement and editing trust
3. browser and API behavior through Playwright-based sweeps
4. production-runtime viability under `next start`

## Preconditions

1. Install dependencies with `npm install`.
2. Ensure seeded reference books exist with `npm run db:seed:references`.
3. Ensure the app is available on `http://127.0.0.1:3000` for browser-facing sweeps.
4. Ensure provider keys exist in `.env` if live-provider steps are being exercised.

## Master Battery Command

```bash
npm run qa:e2e:battery
```

## Execution Procedure

1. Run static validation:
   - `npm run check`
   - `npm run build`
2. Run contract and resilience regressions:
   - `npm run qa:promise-phase2`
   - `npm run qa:artifact-contracts`
   - `npm run qa:stale-dependencies`
   - `npm run qa:workspace-warnings`
3. Run quality and editing trust regressions:
   - `npm run qa:editing-trust`
   - `npm run qa:manuscript-length`
4. Run data-integrity and automation regressions:
   - `npm run qa:archive`
   - `npm run qa:autopilot`
5. Run Playwright/browser sweeps against the live app:
   - `npm run qa:nonfiction`
   - `npm run qa:fiction-publish`
   - `npm run qa:full-system`
6. Run production-runtime verification:
   - `npm run qa:prod-runtime`

## Expected Results

| Battery Slice | Expected Result | Primary Evidence |
| --- | --- | --- |
| Typecheck | exits `0` | console output |
| Build | exits `0` using webpack | console output |
| Promise Phase 2 | structured-output regressions pass | `test-results/e2e-battery/report.json` |
| Artifact contracts | all schema-backed contracts pass | `test-results/e2e-battery/report.json` |
| Stale dependencies | stale-state detection and recovery pass | `test-results/e2e-battery/report.json` |
| Workspace warnings | malformed artifacts show warnings without breaking pages | `test-results/e2e-battery/report.json` |
| Editing trust | revision, compare, commit, and publish sync pass | `test-results/e2e-battery/report.json` |
| Manuscript length | forced-short chapter expands back into band; underlength full manuscript stays blocked | `test-results/e2e-battery/report.json` |
| Archive | archive roundtrip succeeds | `test-results/e2e-battery/report.json` |
| Autopilot | automation flows pass | `test-results/e2e-battery/report.json` |
| Nonfiction Playwright sweep | all nonfiction pages and exports pass | `test-results/nonfiction-regression/report.json` |
| Fiction Playwright sweep | all fiction draft/edit/publish pages and exports pass | `test-results/fiction-publish-regression/report.json` |
| Full-system Playwright sweep | all major browser pages and API routes pass | `test-results/full-system-regression/report.json` |
| Production runtime | built app boots and smoke routes/apis pass | `test-results/production-runtime-smoke/report.json` |

## Output Artifacts

- Aggregate runner report:
  - `test-results/e2e-battery/report.json`
  - `test-results/e2e-battery/summary.md`
- Browser/API reports:
  - `test-results/nonfiction-regression/report.json`
  - `test-results/fiction-publish-regression/report.json`
  - `test-results/full-system-regression/report.json`
  - `test-results/production-runtime-smoke/report.json`

## Failure Triage Procedure

1. Open `test-results/e2e-battery/report.json`.
2. Identify the first failed slice and inspect its command output.
3. If the failure is browser-facing, inspect the corresponding report JSON and screenshot paths.
4. If the failure is workflow-facing, inspect the owning script under `scripts/`.
5. Fix the issue and rerun the failed command first.
6. Rerun `npm run qa:e2e:battery` before closing the defect.

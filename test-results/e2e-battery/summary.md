# End-to-End Battery Summary

- Generated: 2026-05-08T16:48:51.674Z
- Base URL: http://127.0.0.1:3000
- Passed: 14/14
- Failed: 0/14

## Results

### typecheck
- Category: static
- Command: `npm run check`
- Expected: TypeScript completes with exit code 0.
- Status: PASS

### build
- Category: static
- Command: `npm run build`
- Expected: Webpack production build completes with exit code 0.
- Status: PASS

### promise-phase2
- Category: workflow-contract
- Command: `npm run qa:promise-phase2`
- Expected: Promise Phase 2 structured-output regressions pass.
- Status: PASS

### artifact-contracts
- Category: workflow-contract
- Command: `npm run qa:artifact-contracts`
- Expected: Artifact schemas and committed fixture contracts stay valid.
- Status: PASS

### stale-dependencies
- Category: workflow-contract
- Command: `npm run qa:stale-dependencies`
- Expected: Downstream stale-state propagation and recovery signals pass.
- Status: PASS

### workspace-warnings
- Category: resilience
- Command: `npm run qa:workspace-warnings`
- Expected: Malformed workspace artifacts degrade safely with warning surfaces.
- Status: PASS

### editing-trust
- Category: editing
- Command: `npm run qa:editing-trust`
- Expected: Editing compare, revision, commit, and publish-sync semantics hold.
- Status: PASS

### manuscript-length
- Category: quality-enforcement
- Command: `npm run qa:manuscript-length`
- Expected: Forced-short chapters expand back into target band and underlength manuscripts stay blocked.
- Status: PASS

### archive
- Category: data-integrity
- Command: `npm run qa:archive`
- Expected: Archive export/import roundtrip preserves the book state.
- Status: PASS

### autopilot
- Category: automation
- Command: `npm run qa:autopilot`
- Expected: Autopilot control modes and recovery flows complete successfully.
- Status: PASS

### nonfiction-ui
- Category: playwright
- Command: `npm run qa:nonfiction`
- Expected: Playwright nonfiction surface sweep passes against http://127.0.0.1:3000.
- Status: PASS
- Evidence: `test-results/nonfiction-regression/report.json`

### fiction-ui
- Category: playwright
- Command: `npm run qa:fiction-publish`
- Expected: Playwright fiction drafting/editing/publish sweep passes against http://127.0.0.1:3000.
- Status: PASS
- Evidence: `test-results/fiction-publish-regression/report.json`

### full-system
- Category: playwright
- Command: `npm run qa:full-system`
- Expected: Full browser/API regression passes against http://127.0.0.1:3000.
- Status: PASS
- Evidence: `test-results/full-system-regression/report.json`

### prod-runtime
- Category: production-runtime
- Command: `npm run qa:prod-runtime`
- Expected: Built app boots under next start and production smoke checks pass.
- Status: PASS
- Evidence: `test-results/production-runtime-smoke/report.json`

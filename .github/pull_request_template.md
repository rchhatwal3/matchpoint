## What

<!-- One-paragraph summary of the change and why. -->

## Guideline checklist (required before merge)

- [ ] **Feature branch** off `main` (not a direct commit to `main`)
- [ ] **caveman-review** run on the diff and findings resolved
- [ ] **Tests added/updated** for the change
- [ ] `npm test` green and **coverage ≥ 90%** on the logic scope
- [ ] `deno test supabase/functions/` green (if the edge function changed)
- [ ] Migrations that add selected columns are noted as a manual deploy step

## Verify

<!-- How this was exercised end-to-end (commands, browser flow, probes). -->

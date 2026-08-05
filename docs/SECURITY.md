# Security reviews live in a private repo

Full security reviews are **not** in this repository. They are in
**[rchhatwal3/matchpoint-security](https://github.com/rchhatwal3/matchpoint-security)** (private).

## Why

This repo is public and has to stay public — GitHub Pages serves the live site from it on a free plan. The reviews name unfixed weaknesses down to the file and line, explain why particular controls do not trip, and record which protections are deliberately switched off. Published before the fixes ship, that is a working attack guide.

Sanitising them was the alternative and it costs more than it saves: the value is in the detail, and every future review would need the same edit. Splitting them out keeps them at full fidelity.

## Where things are now

| | |
|---|---|
| Full reviews | `matchpoint-security` → `reviews/` (private) |
| Open findings, as backlog items | `TODO.md` in this repo |
| Human-only security steps | `MANUAL_TODOS.md` in this repo |
| Current state and gotchas | `HANDOFF.md` in this repo |

Findings stay tracked in `TODO.md` — a backlog line saying a membership helper needs moving to an unexposed schema is not an attack guide. What moved is the reasoning, the reproduction steps, and the file:line detail.

## If you are adding a review

Write it in the private repo, one file per review, `YYYY-MM-DD-<slug>.md`. Then file each finding as a `TODO.md` item here, described by what needs doing rather than how to exploit it.

## History note

`docs/security/2026-07-27-adversarial-qa.md` was public here before the split and remains in this repo's git history. Its findings are all shipped, so rewriting history to purge it was judged not worth the disruption. The 2026-07-28 review never landed on `main`.

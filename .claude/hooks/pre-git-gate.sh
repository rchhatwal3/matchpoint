#!/usr/bin/env bash
# PreToolUse gate for git commit/push run by Claude Code.
#
# The mechanical checks (typecheck, lint, tests, coverage) are HARD-enforced by
# the husky pre-push hook, which blocks the push for any pusher. This hook adds
# the one thing a script cannot perform — a reminder that caveman-review must be
# done — surfaced at the moment Claude reaches for git, so it can't be silently
# skipped. Non-blocking by design (husky is the hard gate); exits 0 always.
input=$(cat)
cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).tool_input||{}).command||"")}catch{process.stdout.write("")}})')

case "$cmd" in
  *"git commit"*|*"git push"*)
    echo "Guideline gate — before this commit/push confirm: (1) caveman-review run on the diff and findings resolved, (2) tests added for the change, (3) npm test green with coverage >= 90%. The husky pre-push hook independently enforces typecheck + lint + test:ci." >&2
    ;;
esac
exit 0

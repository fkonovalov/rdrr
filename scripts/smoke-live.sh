#!/usr/bin/env bash
# Live smoke test against real external services. Catches upstream API drift
# (GitHub, StackExchange, YouTube, X) that mocked unit tests cannot see.
# Usage: scripts/smoke-live.sh [path-to-cli]  (defaults to dist/cli.mjs)
set -u

CLI="${1:-dist/cli.mjs}"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2" expect_status="$3" min_words="$4"
  local out status words
  out=$(RDRR_NO_HISTORY=1 timeout 60 node "$CLI" "$url" 2>/dev/null)
  status=$?
  words=$(printf '%s' "$out" | grep -o 'word_count: [0-9]*' | head -1 | grep -o '[0-9]*' || echo 0)
  words=${words:-0}
  if [ "$status" -eq "$expect_status" ] && [ "$words" -ge "$min_words" ]; then
    printf 'PASS  %-22s exit=%s words=%s\n' "$name" "$status" "$words"
    PASS=$((PASS + 1))
  else
    printf 'FAIL  %-22s exit=%s words=%s (expected exit=%s words>=%s)\n' \
      "$name" "$status" "$words" "$expect_status" "$min_words"
    FAIL=$((FAIL + 1))
  fi
}

check webpage        "https://en.wikipedia.org/wiki/TypeScript" 0 1000
check gh-issue       "https://github.com/mozilla/readability/issues/1" 0 50
check gh-file        "https://github.com/anthropics/claude-code/blob/main/README.md" 0 100
check gh-repo-root   "https://github.com/anthropics/claude-code" 0 100
check gh-discussion  "https://github.com/vercel/next.js/discussions/10935" 0 500
check stackoverflow  "https://stackoverflow.com/questions/11227809" 0 1000
check youtube        "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 0 300
check raw-text       "https://raw.githubusercontent.com/anthropics/claude-code/main/README.md" 0 100
check llms-txt       "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" 0 1000

echo
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]

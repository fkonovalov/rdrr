#!/bin/bash
# Run this ONCE after Фаза 0 (when github.com/fkonovalov/rdrr points to oss code).
# Sets GitHub repo metadata that can't be configured via files.

REPO="fkonovalov/rdrr"

echo "Setting description, homepage, and topics..."

gh api "repos/$REPO" \
  --method PATCH \
  --field description="Any URL to clean markdown. 10x fewer tokens for AI agents." \
  --field homepage="https://rdrr.app" \
  --jq '.full_name + " ✅"'

gh api "repos/$REPO/topics" \
  --method PUT \
  --input - <<'JSON'
{
  "names": [
    "markdown",
    "web-scraping",
    "content-extraction",
    "html-to-markdown",
    "reader-mode",
    "ai-agents",
    "llm",
    "youtube-transcript",
    "cli",
    "typescript"
  ]
}
JSON

echo "Enabling discussions..."
gh api "repos/$REPO" --method PATCH --field has_discussions=true --jq '.has_discussions'

echo "Adding custom labels..."
for label in \
  "site-support:A specific site doesn't parse well:d4c5f9" \
  "provider/youtube:YouTube provider:1d76db" \
  "provider/github:GitHub provider:1d76db" \
  "provider/pdf:PDF provider:1d76db" \
  "provider/x-profile:X/Twitter profile provider:1d76db" \
  "extract:HTML extraction engine:0e8a16" \
  "cli:CLI related:e4e669"; do
  IFS=":" read -r name desc color <<< "$label"
  gh label create "$name" --description "$desc" --color "$color" --repo "$REPO" 2>/dev/null && echo "  ✅ $name" || echo "  ⏭ $name (exists)"
done

echo "Done! Verify at https://github.com/$REPO"

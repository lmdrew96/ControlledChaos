#!/bin/bash
# Pre-commit hook: type-check and lint before any git commit

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Only run for git commit commands
if echo "$COMMAND" | grep -q 'git commit'; then
  echo "Running build check before commit..." >&2

  cd "$CLAUDE_PROJECT_DIR" || exit 0

  if npm run build 2>&1; then
    echo "Build passed." >&2
    exit 0
  else
    echo "Build failed. Fix errors before committing." >&2
    exit 2
  fi
fi

exit 0

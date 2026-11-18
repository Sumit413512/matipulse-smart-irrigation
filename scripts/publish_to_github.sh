#!/usr/bin/env bash
# Run from repository root after authenticating with GitHub CLI.
# Creates a private repository by default; adjust --private if desired.
set -euo pipefail
command -v gh >/dev/null || { echo 'Install GitHub CLI from https://cli.github.com/'; exit 1; }
gh auth status >/dev/null || { echo 'Run: gh auth login'; exit 1; }
if [ ! -d .git ]; then git init -b main; fi
git add .
if ! git diff --cached --quiet; then
  git commit -m 'Initial MatiPulse source with multi-model weather consensus'
fi
gh repo create Sumit413512/matipulse-smart-irrigation --private --source=. --remote=origin --push

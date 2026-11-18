# Run from the MatiPulse_GitHub_Ready directory in PowerShell.
# Requires Git and authenticated GitHub CLI (gh auth login).
$ErrorActionPreference = 'Stop'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI: https://cli.github.com/' }
gh auth status
if (-not (Test-Path '.git')) { git init -b main }
git add .
if (-not [string]::IsNullOrWhiteSpace((git status --porcelain))) {
  git commit -m 'Initial MatiPulse source with multi-model weather consensus'
}
gh repo create Sumit413512/matipulse-smart-irrigation --private --source=. --remote=origin --push

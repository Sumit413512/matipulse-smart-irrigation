#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo 'MatiPulse running at http://127.0.0.1:8000'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "ERROR: Activate the emotion-film conda env first (Python 3.11+ required)."
  echo "  conda activate emotion-film"
  exit 1
fi

if ! python -c 'import feat' 2>/dev/null; then
  echo "ERROR: py-feat is not installed for this Python:"
  python --version
  which python
  echo "Run: python -m pip install -r requirements.txt"
  exit 1
fi

echo "Starting API with $(which python) ($(python --version))"
exec python -m uvicorn main:app --reload --port 8000

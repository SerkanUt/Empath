#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Python: $(python --version)"
echo "Using:  $(which python)"

PYVER=$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
  :
else
  echo "ERROR: Python 3.11+ required (found $PYVER)."
  echo "  conda create -n emotion-film python=3.11 -y && conda activate emotion-film"
  exit 1
fi

# Use the env's Python for pip — avoids macOS 'pip' pointing at Python 3.9.
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# py-feat pulls in torchcodec, which needs ffmpeg at import time.
if ! python -c "from feat import Detectorv2" 2>/dev/null; then
  echo "Installing ffmpeg (required by py-feat)..."
  if command -v conda >/dev/null 2>&1 && [[ -n "${CONDA_DEFAULT_ENV:-}" ]]; then
    conda install -y ffmpeg -c conda-forge
  else
    echo "WARNING: Install ffmpeg manually (e.g. brew install ffmpeg or conda install ffmpeg)"
  fi
  python -c "from feat import Detectorv2"
fi

echo ""
echo "Done. Start the API with:"
echo "  ./run.sh"
echo "  # or: python -m uvicorn main:app --reload --port 8000"

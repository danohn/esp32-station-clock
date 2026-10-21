#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "${IDF_PATH:-}" && -f "$PROJECT_DIR/.local/esp-idf/export.sh" ]]; then
    export IDF_PATH="$PROJECT_DIR/.local/esp-idf"
    export IDF_TOOLS_PATH="${IDF_TOOLS_PATH:-$PROJECT_DIR/.local/idf-tools}"
    export IDF_PYTHON_ENV_PATH="${IDF_PYTHON_ENV_PATH:-$IDF_TOOLS_PATH/python_env/idf5.5_py3.12_env}"
    export PATH="$IDF_PYTHON_ENV_PATH/bin:$PATH"
fi
if [[ -n "${IDF_PATH:-}" && -f "$IDF_PATH/export.sh" ]]; then
    source "$IDF_PATH/export.sh" >/dev/null
elif ! command -v idf.py >/dev/null 2>&1; then
    echo "ESP-IDF is not available. Activate ESP-IDF v5.5.2 or run tools/setup_idf.sh." >&2
    exit 1
fi
cd "$PROJECT_DIR"
exec idf.py "$@"

#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
command -v uv >/dev/null || { echo "Install uv first: https://docs.astral.sh/uv/getting-started/installation/" >&2; exit 1; }
command -v git >/dev/null || { echo "Git is required." >&2; exit 1; }
mkdir -p "$PROJECT_DIR/.local"
export IDF_PATH="$PROJECT_DIR/.local/esp-idf"
export IDF_TOOLS_PATH="$PROJECT_DIR/.local/idf-tools"
if [[ ! -f "$IDF_PATH/tools/idf_tools.py" ]]; then
    git clone --branch v5.5.2 --depth 1 --recursive --shallow-submodules https://github.com/espressif/esp-idf.git "$IDF_PATH"
fi
# SDK installation uses its supported Python, independently of the artwork tools.
uv run --no-project --python 3.12 "$IDF_PATH/tools/idf_tools.py" install --targets=esp32s3
uv run --no-project --python 3.12 "$IDF_PATH/tools/idf_tools.py" install-python-env
printf '\nSDK ready. Run tools/idf.sh build\n'

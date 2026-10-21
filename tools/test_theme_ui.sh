#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_BUILD="$PROJECT_DIR/.local/theme-ui-test/build"
if [[ ! -f "$PROJECT_DIR/managed_components/lvgl__lvgl/CMakeLists.txt" ]]; then
    echo "LVGL component not found. Run tools/idf.sh reconfigure first." >&2
    exit 1
fi
cmake -S "$PROJECT_DIR/tests/theme_ui" -B "$TEST_BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Debug "$@"
cmake --build "$TEST_BUILD" --parallel 6
"$TEST_BUILD/theme_ui"

# Station Clock project guidance

- Keep the DB face and branding unless the user requests a change. Third-party marks are excluded from the original-code MIT license.
- Firmware is ESP-IDF v5.5.2, C++, LVGL 9, targeting the Waveshare ESP32-S3-Touch-AMOLED-1.8 V2. Original revision hardware remains unverified.
- Use `uv run` for Python tools and `uv sync` for Python dependencies. Artwork/USB tools use Python 3.14; ESP-IDF manages its separate Python 3.12 environment.
- `.local/` contains ignored SDKs, toolchains, logs and historical development files. Never commit it or credentials.
- Firmware builds: `tools/idf.sh build`. It supports an activated external SDK or the optional `.local/` SDK installed by `tools/setup_idf.sh`.
- Native movement checks: compile and run `tests/test_movement.cpp` using C++17. Protocol tests: `npm test`. Browser tests: `npm run test:browser` after packaging firmware and building the site.
- SVG artwork is the source of truth. Regenerate C arrays/PNGs with `uv run tools/generate_assets.py`; avoid hand-editing generated arrays.
- Package firmware from a successful build with `uv run tools/package_firmware.py`. Build the static installer with `npm run build:site`; its output is `.local/site/`.
- Browser setup uses the firmware's existing text protocol, not Improv. Never send Wi-Fi credentials to a server, browser storage or logs.
- Keep serial hardware tests and flashing separate from simulated browser tests. A factory flash clears Wi-Fi settings. Do not flash the connected board merely to test site layout or setup.

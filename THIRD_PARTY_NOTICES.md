# Third-party notices

This is an independent station-clock project, not affiliated with, sponsored by, or endorsed by Deutsche Bahn, Waveshare, Espressif, or ESPHome.

## Deutsche Bahn branding

The DB logo is retained in the clock face, generated artwork, preview, site and compiled firmware at the project owner's direction. Deutsche Bahn AG retains ownership of the DB mark and associated design assets. The project's MIT license does not grant rights in those assets.

Logo source: https://github.com/db-ui/base/blob/main/assets/images/db_logo.svg

DB's source-code license excludes DB-specific design assets. The upstream branding statement and separate DB Designs License apply to those assets; including them here does not relicense them under MIT:

- https://github.com/db-ui/base#deutsche-bahn-brand
- https://github.com/db-ui/base#license

The railway movement follows Deutsche Bahn's published description of a 58-second sweep and two-second pause. The face geometry is reconstructed from [Wilfredor's CC0 Munich Hauptbahnhof photograph](https://commons.wikimedia.org/wiki/File:Deutsche_Bahn_clock_at_Munich_Central_Station.jpg); see [measurement notes](docs/clock-reference.md). It is not a manufacturer-supplied drawing. The 180 ms minute advance remains an approximation rather than a measured movement profile.

Reference: https://www.deutschebahn.com/resource/blob/6859022/5561c3dfe03f6a9f351aacf65f245d9c/2020-10-Themendienst-Uhrzeit-und-Zeitumstellung-data.pdf

## Firmware dependencies

Dependencies are installed separately and recorded in `dependencies.lock`. Preserve their accompanying notices when redistributing them or derivative binaries.

- ESP-IDF: https://github.com/espressif/esp-idf
- Waveshare board package and drivers: https://github.com/waveshareteam/Waveshare-ESP32-components
- Waveshare reference examples: https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-1.8
- LVGL: https://github.com/lvgl/lvgl
- ESP LVGL Port: https://github.com/espressif/esp-bsp/tree/master/components/esp_lvgl_port

## Browser installer

ESP Web Tools 10.4.0 is distributed under Apache-2.0. Its bundled installer contains its own dependency notices. The site builder copies the published browser distribution and license unchanged; no remote CDN import is required at runtime.

- https://github.com/esphome/esp-web-tools
- https://github.com/esphome/esp-web-tools/blob/main/LICENSE

Node dependencies are recorded in `package-lock.json`; Python tooling dependencies are recorded in `uv.lock`. Their own licenses apply.

# Hardware and verification

## Supported target

Waveshare ESP32-S3-Touch-AMOLED-1.8 V2: ESP32-S3, 16 MB quad flash, 8 MB octal PSRAM, 368 × 448 CO5300 AMOLED, CST820-family capacitive touch, TCA9554 I/O expander and PCF85063 RTC.

The original SH8601/FT3168 revision has not been tested. ESP Web Tools can identify the ESP32-S3 chip family, but cannot identify which display board is attached. The site therefore asks the user to confirm the V2 model before installing.

## Display integration

The application uses Waveshare's low-level panel, I2C and touch helpers. `main/board_display.cpp` releases the expander's display/touch reset lines and uses the SPI/QSPI LVGL port with two 48-line internal DMA buffers. This avoids the BSP 2.0.3 high-level startup's RGB-panel port. Image data is cached in PSRAM.

## Verification recorded on 21 October 2026

- Physical face and moving seconds hand confirmed visible by the board owner.
- Flash writes verified by the flashing tool.
- Sweep/hold/restart calculations tested across a full day's hand-angle ranges.
- USB time setting, timezone switching, brightness bounds, replay and live return checked on hardware.
- RTC time restoration checked across USB-triggered resets.
- Saved Wi-Fi settings, DHCP connection and automatic SNTP synchronisation checked across a restart.
- A sweep-only ten-second interval measured 46.4 LVGL render events/s with 19.45 ms average render duration. Other hand angles are slower; this is not an optical panel-refresh measurement and 60 fps is not sustained.
- One replay logged the stop at `10:09:58.014` and restart at `10:10:00.002`. These are render-update timestamps, not optical measurements.

Raw machine-specific logs are retained locally under `.local/logs/`, not committed. Site browser tests simulate the serial device; they do not prove end-to-end browser flashing on physical hardware.

## Power and USB

The first version is intended for USB power. RTC retention requires the board's RTC power source to remain available. Opening the native USB serial port may reset the board on macOS; setup waits for boot before sending commands. Only one process or browser session may own the serial port at a time.

A merged factory image includes erased gaps covering settings storage. Installing it clears saved settings. A normal ESP-IDF app/bootloader/partition update can preserve NVS.

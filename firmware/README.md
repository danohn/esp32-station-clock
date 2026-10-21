# Factory firmware image

The image and checksum are generated locally and by CI; they are not stored in Git.

After a successful source build:

```sh
uv sync
uv run tools/package_firmware.py
```

This creates `db-station-clock-factory.bin` and `SHA256SUMS.txt` in this directory. The image combines the bootloader, partition table and application for the **Waveshare ESP32-S3-Touch-AMOLED-1.8 V2** with 16 MB flash and 8 MB octal PSRAM.

Flash at offset `0x0`, without needing ESP-IDF on the flashing computer:

```sh
uvx --from esptool==5.6.0 esptool --chip esp32s3 --port YOUR_SERIAL_PORT write-flash 0x0 firmware/db-station-clock-factory.bin
uv run tools/clockctl.py sync
```

A factory installation clears saved settings, including Wi-Fi credentials. The image contains no credentials. An ordinary ESP-IDF application update can preserve NVS settings.

The same merged image is copied into the static website by `npm run build:site`, with a matching SHA-256 checksum and ESP Web Tools manifest. Use the installer and setup instructions in the project README.

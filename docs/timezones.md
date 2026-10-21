# Timezones

Firmware 0.3.0 recognises 598 IANA timezone IDs and aliases. Browser setup shows
geographical locations and UTC, searchable by city, country, region or IANA ID.
**Use this computer's timezone** selects the browser's reported location only
when clicked; connecting never changes a clock's saved timezone automatically.

The CLI accepts IANA IDs, for example `Europe/London`, `America/New_York`,
`Asia/Kolkata`, `Asia/Kathmandu` and `Pacific/Chatham`. Run
`uv run tools/clockctl.py timezones [SEARCH]` to list locations without a board.
The original `Sydney`, `Berlin` and `UTC` commands remain valid.

## Data and range

The source is [IANA tzdb](https://www.iana.org/time-zones) **2026e**, provided by
the pinned Python **tzdata 2026.5** dependency. Generation explicitly opens
that package's TZif files, never the developer's operating-system timezone
database. It reads exact transition instants and expands future recurring rules
through Python's `zoneinfo`. Shared offset histories are deduplicated into
4,565 transitions. Half-hour and quarter-hour zones, southern-hemisphere DST,
Ramadan changes and transitions beyond 2038 are included.

The snapshot covers **2024-01-01 UTC up to, but not including, 2100-01-01 UTC**,
matching the USB set-time range. Firmware outside that range holds the nearest
known offset. Published future rules are a forecast of current law; a government
change requires updated data and firmware. SNTP updates UTC time only.

UTC stays in the ESP32 system clock, C-library timezone and onboard RTC. The
display and USB status apply the selected offset with a binary search through
the embedded transitions. Nothing is downloaded at runtime.

## Saved settings and compatibility

The firmware stores the IANA ID in the NVS `timezone` string. If it is missing
or invalid, startup reads the original integer `zone` setting (0 Sydney,
1 Berlin, 2 UTC), falling back to Sydney for an invalid value. An application
update preserving NVS therefore carries existing settings over. Factory
installation clears settings as before. Downgrading to pre-0.3 firmware cannot
restore newly selected IANA locations; that firmware only reads its old setting.

`CLOCK_STATUS` includes `zone=<IANA-ID>` and `tzdb=2026e`. Browser setup uses
the latter capability field to enable the full picker. A full status without it
retains the original three choices and explains that an update is needed.
Partial boot messages cannot reset the detected capability or unsaved selection.

## Regeneration and verification

```sh
uv sync --frozen
uv run tools/generate_timezones.py
uv run tools/generate_timezones.py --check
uv run tests/test_timezones.py
```

The generator writes `main/generated/timezone_catalog.hpp`,
`assets/timezones.json` (CLI) and `site/timezones.js` (browser). CI checks that
all match the pinned database. To update rules, pin a new tzdata version with
`uv add tzdata==VERSION`, regenerate, verify, update the version references in
these notes and build/release new firmware.

The native comparison checks the actual compiled firmware lookup against IANA
across every ID, at exact source transitions and dates through 2099. Future
recurring transitions receive additional half-hour probes for representative
northern/southern and fractional DST zones. Browser tests simulate USB setup,
including old firmware, search, computer-timezone selection and incoming status
while editing. These checks do not replace physical firmware verification.

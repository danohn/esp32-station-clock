# Movement and timekeeping

The rendering model is independent of the display. `railway::pose` in `main/movement.hpp` takes hour, minute and fractional seconds and returns hand angles measured clockwise from twelve.

- Each theme supplies its movement profile to the same `railway::pose` engine: DB sweeps through 360 degrees in 58 seconds, Swiss in 58.5 seconds.
- After its sweep, the hand waits at twelve until the next minute boundary: two seconds for DB, 1.5 seconds for Swiss. The Swiss duration follows [SBB's clock documentation](https://digital.sbb.ch/en/design-system/lyne/components/clock/).
- At the boundary the minute hand advances six degrees over 180 ms using a short smooth transition. This duration and curve are an adjustable approximation pending comparison with a specific mechanism.
- The hour hand is coupled to that displayed minute position.
- Each update derives angles from the current time, so skipped render frames do not accumulate clock drift.

Wi-Fi uses SNTP with `pool.ntp.org`, smooth adjustment and ESP-IDF's default periodic update interval. Internally, time is UTC. The board stores UTC in its PCF85063 RTC and restores it at boot, then synchronises when networking is available. Sydney, Berlin and UTC are selectable; Sydney and Berlin include their daylight-saving rules. The 58/2 motion changes the display phase, not the underlying length of a minute.

The browser preview follows the same movement formula and generated theme metadata using the visitor's local browser time. It is a visual preview, not a live reading from the board. The connected-device status line reports the board's time separately.

Theme changes use the current time rather than starting a new minute or replay. During a crossfade, both faces continue using their own sweep duration. The selected theme is independent of timezone and brightness. Touch selection is saved by the console task after a 400 ms debounce; USB selection is saved before its acknowledgement. Theme IDs are stored as strings so a future catalog reorder does not change saved selections. Unknown or missing IDs restore DB.

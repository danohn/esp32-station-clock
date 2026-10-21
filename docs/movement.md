# Movement and timekeeping

The rendering model is independent of the display. `railway::pose` in `main/movement.hpp` takes hour, minute and fractional seconds and returns hand angles measured clockwise from twelve.

- From second 0 through 58, the seconds hand advances uniformly through 360 degrees.
- From second 58 through the next minute boundary, the hand stays at twelve.
- At the boundary the minute hand advances six degrees over 180 ms using a short smooth transition. This duration and curve are an adjustable approximation pending comparison with a specific mechanism.
- The hour hand is coupled to that displayed minute position.
- Each update derives angles from the current time, so skipped render frames do not accumulate clock drift.

Wi-Fi uses SNTP with `pool.ntp.org`, smooth adjustment and ESP-IDF's default periodic update interval. Internally, time is UTC. The board stores UTC in its PCF85063 RTC and restores it at boot, then synchronises when networking is available. Sydney, Berlin and UTC are selectable; Sydney and Berlin include their daylight-saving rules. The 58/2 motion changes the display phase, not the underlying length of a minute.

The browser preview follows the same movement formula using the visitor's local browser time. It is a visual preview, not a live reading from the board. The connected-device status line reports the board's time separately.

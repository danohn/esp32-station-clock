#pragma once
#include <algorithm>
#include <cmath>

namespace railway {
struct Pose { double hour, minute, second; bool waiting; };
struct Movement { double sweep_seconds=58.0; double advance_seconds=0.18; };
// Seconds and transition duration are real elapsed seconds. Zero degrees is 12.
inline Pose pose(int hour, int minute, double seconds, Movement movement = {}) {
    const double s = std::clamp(seconds, 0.0, 59.999999);
    const double t = std::clamp(s / movement.advance_seconds, 0.0, 1.0);
    const double advance = t * t * (3.0 - 2.0 * t);
    const double displayed_minutes = hour * 60.0 + minute - 1.0 + advance;
    auto wrap = [](double x) { return x - std::floor(x / 360.0) * 360.0; };
    return {wrap(displayed_minutes * 0.5), wrap(displayed_minutes * 6.0),
            s >= movement.sweep_seconds ? 0.0 : s / movement.sweep_seconds * 360.0,
            s >= movement.sweep_seconds};
}
} // namespace railway

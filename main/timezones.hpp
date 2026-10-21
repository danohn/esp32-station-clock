#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include "generated/timezone_catalog.hpp"

namespace clock_zone {
inline constexpr std::size_t count = sizeof(data::zones) / sizeof(data::zones[0]);

inline int find(const char *id) {
    if (!id) return -1;
    if (std::strcmp(id, "Sydney") == 0) id = "Australia/Sydney";
    if (std::strcmp(id, "Berlin") == 0) id = "Europe/Berlin";
    std::size_t low = 0, high = count;
    while (low < high) {
        const auto middle = low + (high - low) / 2;
        const int order = std::strcmp(data::zones[middle].id, id);
        if (order < 0) low = middle + 1;
        else high = middle;
    }
    return low < count && std::strcmp(data::zones[low].id, id) == 0 ? int(low) : -1;
}

inline int restore(const char *saved, int legacy) {
    const int found = find(saved);
    if (found >= 0) return found;
    return find(legacy == 1 ? "Europe/Berlin" : legacy == 2 ? "UTC" : "Australia/Sydney");
}

inline int32_t offset_at(int index, int64_t epoch) {
    if (index < 0 || std::size_t(index) >= count) return 0;
    const auto &zone = data::zones[index];
    const auto *transitions = data::transitions + zone.first;
    // Time has not been set at boot, or is beyond this firmware's data range.
    // Hold the nearest known offset; supported set-time commands are 2024–2099.
    const int64_t since = epoch - data::start;
    std::size_t low = 0, high = zone.count;
    while (low < high) {
        const auto middle = low + (high - low) / 2;
        if (int64_t(transitions[middle].since) <= since) low = middle + 1;
        else high = middle;
    }
    return transitions[low ? low - 1 : 0].offset;
}
}

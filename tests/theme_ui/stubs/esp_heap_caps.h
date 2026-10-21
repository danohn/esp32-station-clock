#pragma once
#include <cstddef>
#include <cstdlib>
constexpr unsigned MALLOC_CAP_SPIRAM = 1, MALLOC_CAP_8BIT = 2;
inline unsigned sprite_allocations = 0;
inline std::size_t sprite_bytes = 0;
inline void *heap_caps_aligned_alloc(std::size_t alignment, std::size_t bytes, unsigned) {
    void *memory = nullptr;
    if (posix_memalign(&memory, alignment, bytes)) return nullptr;
    ++sprite_allocations;
    sprite_bytes += bytes;
    return memory;
}

#pragma once
#include "lvgl.h"

namespace clock_ui {
// LVGL operations must run under the BSP display lock (or in its event thread).
// Callbacks run in that same context and should enqueue any persistent writes.
bool start(lv_display_t *display, int initial_theme, bool show_hint,
           void (*selection_changed)(int), void (*replay)());
void draw(int hour, int minute, double seconds);
bool select(int index, bool animate = true);
// Safe to read from the console task without taking the display lock.
int selected();
} // namespace clock_ui

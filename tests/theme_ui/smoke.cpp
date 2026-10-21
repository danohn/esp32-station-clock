#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>
#include "lvgl.h"
#include "esp_heap_caps.h"
#include "generated/theme_catalog.hpp"
#include "theme_view.hpp"

namespace {
lv_indev_t *pointer;
lv_point_t point{};
bool down = false;
unsigned selection_count = 0, replay_count = 0, flush_count = 0, warning_count = 0;
std::vector<uint16_t> framebuffer(368 * 448);

void advance(unsigned milliseconds) {
    for (unsigned elapsed = 0; elapsed < milliseconds; elapsed += 10) {
        lv_tick_inc(10);
        lv_timer_handler();
    }
}
void touch(int x, int y, bool pressed) {
    point = {x, y};
    down = pressed;
    lv_indev_read(pointer);
}
void tap(int x, int y, unsigned duration = 40) {
    touch(x, y, true);
    advance(duration);
    touch(x, y, false);
}
void swipe(int x0, int y0, int x1, int y1) {
    touch(x0, y0, true);
    advance(20);
    touch(x1, y1, true);
    advance(20);
    touch(x1, y1, false);
}
void require(bool condition, const char *message) {
    if (!condition) { std::fprintf(stderr, "FAIL: %s\n", message); std::exit(1); }
}
} // namespace

int main() {
    lv_init();
    lv_log_register_print_cb([](lv_log_level_t, const char *message) {
        ++warning_count;
        std::fputs(message, stderr);
    });
    auto *display = lv_display_create(368, 448);
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(display, framebuffer.data(), nullptr,
                           framebuffer.size() * sizeof(uint16_t), LV_DISPLAY_RENDER_MODE_DIRECT);
    lv_display_set_flush_cb(display, [](lv_display_t *d, const lv_area_t *, uint8_t *) {
        ++flush_count;
        lv_display_flush_ready(d);
    });
    pointer = lv_indev_create();
    lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
    lv_indev_set_display(pointer, display);
    lv_indev_set_read_cb(pointer, [](lv_indev_t *, lv_indev_data_t *data) {
        data->point = point;
        data->state = down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
    });
    require(clock_ui::start(display, 0, true, [](int) { ++selection_count; },
                            []() { ++replay_count; }), "start succeeds");
    require(selection_count == 0, "initial theme does not notify persistence callback");
    clock_ui::draw(10, 10, 15.0);
    advance(100);
    require(flush_count > 0, "actual LVGL software drawing flushes framebuffer");
    require(sprite_allocations == 8, "all eight artwork assets cached once");

    swipe(280, 230, 100, 230);
    require(clock_ui::selected() == 1 && selection_count == 1, "face swipe switches theme");
    require(!clock_ui::select(0), "rapid selection blocked during transition");
    advance(70);
    clock_ui::draw(10, 10, 15.07);
    require(!clock_ui::select(0), "transition remains active before 150 ms");
    tap(184, 425, 10);
    require(clock_ui::selected() == 1 && selection_count == 1,
            "rapid pill input is ignored while transition is busy");
    advance(40);
    require(!clock_ui::select(0), "transition remains active at 120 ms");
    advance(70);
    require(clock_ui::select(0), "transition completes and permits next selection");
    advance(220);
    tap(184, 425);
    require(clock_ui::selected() == 1, "pill touch reaches screen and switches theme");
    advance(220);
    tap(184, 425, 800);
    require(clock_ui::selected() == 1, "held pill does not switch theme");
    tap(12, 425);
    require(clock_ui::selected() == 0, "full bottom strip is a generous pill target");
    advance(220);
    swipe(240, 210, 180, 350);
    require(clock_ui::selected() == 0, "vertical-dominant diagonal does not switch");

    advance(400);
    tap(180, 220);
    advance(60);
    tap(182, 220);
    require(replay_count == 1, "double face tap triggers replay once");
    advance(400);
    swipe(100, 220, 260, 220);
    advance(220);
    tap(260, 220);
    require(replay_count == 1, "face tap following swipe is not a double tap");
    advance(400);
    touch(180, 220, true);
    touch(240, 220, true);
    touch(180, 220, true);
    touch(180, 220, false);
    tap(180, 220);
    require(replay_count == 1, "drag returning to origin is not replay tap");

    auto *screen = lv_display_get_screen_active(display);
    const unsigned objects_before = lv_obj_get_child_count(screen);
    for (int cycle = 0; cycle < 150; ++cycle) {
        require(clock_ui::select(1 - clock_ui::selected()), "repeated switch accepted");
        for (int frame = 0; frame < 20; ++frame) {
            clock_ui::draw(10, 10, 58.25 + frame / 100.0);
            advance(10);
        }
    }
    require(sprite_allocations == 8, "repeated switches allocate no extra sprite cache");
    require(lv_obj_get_child_count(screen) == objects_before, "switches do not create more UI objects");
    // Verify the real LVGL hand angles are driven by each theme's movement.
    for (int index = 0; index < 2; ++index) {
        if (clock_ui::selected() != index) require(clock_ui::select(index, false), "instant select");
        clock_ui::draw(10, 10, 58.25);
        auto *group = lv_obj_get_child(screen, 1); // select brings the active theme to this slot
        auto *second = lv_obj_get_child(group, 3);
        const auto expected = railway::pose(10, 10, 58.25, clock_theme::themes[index].movement);
        require(lv_image_get_rotation(second) == int(std::lround(expected.second * 10)) % 3600,
                "actual LVGL hand follows per-theme timing");
    }
    advance(2000);
    require(warning_count == 0, "renderer reports no allocation or draw warnings");
    // Optional native-resolution frames from the actual software renderer.
    // These are host previews, not photographs of physical panel output.
    if(const char *directory=std::getenv("CLOCK_THEME_FRAME_DIR")) {
        for(int index=0;index<2;index++) {
            if(clock_ui::selected()!=index) require(clock_ui::select(index,false),"frame select");
            clock_ui::draw(9,40,clock_theme::themes[index].movement.sweep_seconds*105/360);
            advance(2000);
            lv_refr_now(display);
            const std::string path=std::string(directory)+"/"+clock_theme::themes[index].id+".ppm";
            FILE *file=std::fopen(path.c_str(),"wb");require(file!=nullptr,"frame output opens");
            std::fprintf(file,"P6\n368 448\n255\n");
            for(uint16_t pixel:framebuffer) {
                const unsigned char rgb[]={static_cast<unsigned char>(((pixel>>11)&31)*255/31),
                    static_cast<unsigned char>(((pixel>>5)&63)*255/63),
                    static_cast<unsigned char>((pixel&31)*255/31)};
                std::fwrite(rgb,1,3,file);
            }
            std::fclose(file);
        }
    }
    std::printf("LVGL theme UI smoke passed: %u switches, %u sprite allocations (%zu bytes), %u flushes, %u warnings\n",
                selection_count, sprite_allocations, sprite_bytes, flush_count, warning_count);
    return 0;
}

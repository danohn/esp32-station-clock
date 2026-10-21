#include "theme_view.hpp"
#include <atomic>
#include <cmath>
#include <cstring>
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "generated/theme_catalog.hpp"
#include "theme_input.hpp"

namespace clock_ui {
namespace {
constexpr int center_x = 184, center_y = 224;
constexpr int bottom_strip = 408;
constexpr uint32_t transition_ms = 150;
constexpr uint32_t double_tap_ms = 350;
const char *TAG = "clock_themes";

struct Face {
    lv_obj_t *group = nullptr;
    lv_obj_t *hour = nullptr;
    lv_obj_t *minute = nullptr;
    lv_obj_t *second = nullptr;
};
Face faces[clock_theme::count];
lv_image_dsc_t cached[clock_theme::count * 4];
unsigned cache_count = 0;
std::atomic<int> current{0};
lv_obj_t *screen = nullptr, *indicator[clock_theme::count] = {}, *label = nullptr;
lv_timer_t *label_timer = nullptr;
void (*selection_callback)(int) = nullptr;
void (*replay_callback)() = nullptr;
bool transitioning = false;
int outgoing = 0;
int last_hour = 0, last_minute = 0;
double last_second = 0;
railway::ThemeInput input;
uint32_t press_started = 0, last_tap = 0;
lv_point_t previous_tap{};
bool tap_pending = false, ignore_press = false;

const lv_image_dsc_t *cache_asset(const lv_image_dsc_t *source) {
    if (cache_count >= clock_theme::count * 4) {
        ESP_LOGW(TAG, "Artwork cache is full; using flash artwork");
        return source;
    }
    auto *pixels = static_cast<uint8_t *>(heap_caps_aligned_alloc(
        16, source->data_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!pixels) {
        ESP_LOGW(TAG, "Using flash artwork (PSRAM cache unavailable)");
        return source;
    }
    std::memcpy(pixels, source->data, source->data_size);
    auto &asset = cached[cache_count++];
    asset = *source;
    asset.data = pixels;
    return &asset;
}

void passive(lv_obj_t *obj) {
    lv_obj_set_clickable(obj, false);
    lv_obj_set_scrollable(obj, false);
}

lv_obj_t *make_image(lv_obj_t *parent, const clock_theme::Sprite &sprite, bool hand = true) {
    auto *obj = lv_image_create(parent);
    lv_image_set_src(obj, cache_asset(sprite.image));
    lv_image_set_pivot(obj, sprite.pivot_x, sprite.pivot_y);
    lv_obj_set_pos(obj, hand ? center_x - sprite.pivot_x : 0,
                  hand ? center_y - sprite.pivot_y : 0);
    lv_image_set_antialias(obj, true);
    passive(obj);
    return obj;
}

void draw_face(int index) {
    const auto pose = railway::pose(last_hour, last_minute, last_second,
                                    clock_theme::themes[index].movement);
    auto &face = faces[index];
    lv_image_set_rotation(face.hour, int(std::lround(pose.hour * 10)) % 3600);
    lv_image_set_rotation(face.minute, int(std::lround(pose.minute * 10)) % 3600);
    lv_image_set_rotation(face.second, int(std::lround(pose.second * 10)) % 3600);
}

void hide_label(lv_timer_t *timer) {
    lv_obj_fade_out(label, 250, 0);
    lv_timer_pause(timer);
}

void show_label(const char *text, uint32_t duration = 1400) {
    // The label only animates its opacity; cancel a previous fade when reused.
    lv_anim_delete(label, nullptr);
    lv_label_set_text(label, text);
    lv_obj_set_style_opa(label, LV_OPA_COVER, 0);
    lv_obj_align(label, LV_ALIGN_TOP_MID, 0, 10);
    lv_timer_set_period(label_timer, duration);
    lv_timer_reset(label_timer);
    lv_timer_resume(label_timer);
}

void update_indicator() {
    for (unsigned i = 0; i < clock_theme::count; ++i)
        lv_obj_set_style_bg_color(indicator[i], lv_color_hex(
            int(i) == current.load() ? 0xd1d1d1 : 0x555555), 0);
}

void fade_frame(void *, int32_t value) {
    lv_obj_set_style_opa_layered(faces[current.load()].group, lv_opa_t(value), 0);
}

void fade_complete(lv_anim_t *) {
    lv_obj_set_hidden(faces[outgoing].group, true);
    lv_obj_set_style_opa_layered(faces[current.load()].group, LV_OPA_COVER, 0);
    transitioning = false;
}

void touch_event(lv_event_t *event) {
    const auto code = lv_event_get_code(event);
    if (code == LV_EVENT_PRESS_LOST) {
        input.cancel();
        tap_pending = false;
        ignore_press = true;
        return;
    }
    if (code != LV_EVENT_PRESSED && code != LV_EVENT_PRESSING && code != LV_EVENT_RELEASED)
        return;
    auto *device = lv_event_get_indev(event);
    if (!device) return;
    lv_point_t point{};
    lv_indev_get_point(device, &point);
    if (code == LV_EVENT_PRESSED) {
        ignore_press = transitioning;
        if (ignore_press) tap_pending = false;
        press_started = lv_tick_get();
        input.begin(point.x, point.y);
    } else if (code == LV_EVENT_PRESSING) {
        input.move(point.x, point.y);
    } else {
        const auto action = input.end(point.x, point.y);
        if (ignore_press) return;
        if (action != railway::ThemeInput::Action::none) {
            tap_pending = false;
            if (action == railway::ThemeInput::Action::pill &&
                lv_tick_elaps(press_started) > 500) return;
            const int offset = action == railway::ThemeInput::Action::previous ? -1 : 1;
            select((current.load() + int(clock_theme::count) + offset) % int(clock_theme::count));
        } else if (!input.dragged() && point.y < bottom_strip &&
                   lv_tick_elaps(press_started) <= double_tap_ms) {
            const int dx = point.x - previous_tap.x, dy = point.y - previous_tap.y;
            if (tap_pending && lv_tick_elaps(last_tap) <= double_tap_ms && dx*dx + dy*dy <= 400) {
                tap_pending = false;
                if (replay_callback) replay_callback();
            } else {
                tap_pending = true;
                last_tap = lv_tick_get();
                previous_tap = point;
            }
        } else tap_pending = false;
    }
}
} // namespace

bool start(lv_display_t *display, int initial_theme, bool show_hint,
           void (*selection_changed)(int), void (*replay)()) {
    if (!display || screen) return false;
    if (initial_theme < 0 || initial_theme >= int(clock_theme::count)) initial_theme = 0;
    current.store(initial_theme);
    selection_callback = selection_changed;
    replay_callback = replay;
    screen = lv_display_get_screen_active(display);
    lv_obj_set_scrollable(screen, false);
    lv_obj_set_clickable(screen, true);
    lv_obj_set_style_bg_color(screen, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);

    for (unsigned i = 0; i < clock_theme::count; ++i) {
        const auto &theme = clock_theme::themes[i];
        auto &face = faces[i];
        face.group = lv_obj_create(screen);
        lv_obj_remove_style_all(face.group);
        lv_obj_set_size(face.group, 368, 448);
        lv_obj_set_pos(face.group, 0, 0);
        passive(face.group);
        make_image(face.group, theme.dial, false);
        face.hour = make_image(face.group, theme.hour);
        face.minute = make_image(face.group, theme.minute);
        face.second = make_image(face.group, theme.second);
        if (int(i) != initial_theme) lv_obj_set_hidden(face.group, true);
    }

    auto *pill = lv_obj_create(screen);
    lv_obj_remove_style_all(pill);
    lv_obj_set_size(pill, 48, 16);
    lv_obj_set_pos(pill, center_x - 24, 417);
    lv_obj_set_style_radius(pill, 8, 0);
    lv_obj_set_style_bg_color(pill, lv_color_hex(0x242424), 0);
    lv_obj_set_style_bg_opa(pill, LV_OPA_COVER, 0);
    passive(pill);
    for (unsigned i = 0; i < clock_theme::count; ++i) {
        indicator[i] = lv_obj_create(pill);
        lv_obj_remove_style_all(indicator[i]);
        lv_obj_set_size(indicator[i], 14, 4);
        lv_obj_set_pos(indicator[i], 7 + int(i) * 20, 6);
        lv_obj_set_style_radius(indicator[i], 2, 0);
        lv_obj_set_style_bg_opa(indicator[i], LV_OPA_COVER, 0);
        passive(indicator[i]);
    }
    update_indicator();
    label = lv_label_create(screen);
    passive(label);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(label, lv_color_hex(0xbdbdbd), 0);
    lv_obj_set_style_opa(label, LV_OPA_TRANSP, 0);
    label_timer = lv_timer_create(hide_label, 1400, nullptr);
    lv_timer_pause(label_timer);
    if (show_hint) show_label("Swipe to change clock", 4000);
    lv_obj_add_event_cb(screen, touch_event, LV_EVENT_ALL, nullptr);
    return true;
}

void draw(int hour, int minute, double seconds) {
    if (!screen) return;
    last_hour = hour;
    last_minute = minute;
    last_second = seconds;
    draw_face(current.load());
    if (transitioning) draw_face(outgoing);
}

bool select(int index, bool animate) {
    if (!screen || index < 0 || index >= int(clock_theme::count) || transitioning) return false;
    if (index == current.load()) return true;
    outgoing = current.load();
    current.store(index);
    draw_face(index);
    auto *incoming = faces[index].group;
    // Above the outgoing dial, below the persistent indicator and label.
    lv_obj_move_to_index(incoming, int(clock_theme::count) - 1);
    lv_obj_set_hidden(incoming, false);
    lv_obj_set_style_opa_layered(incoming, animate ? LV_OPA_TRANSP : LV_OPA_COVER, 0);
    update_indicator();
    show_label(clock_theme::themes[index].label);
    tap_pending = false;
    if (animate) {
        transitioning = true;
        lv_anim_t animation;
        lv_anim_init(&animation);
        lv_anim_set_var(&animation, screen);
        lv_anim_set_values(&animation, LV_OPA_TRANSP, LV_OPA_COVER);
        lv_anim_set_duration(&animation, transition_ms);
        lv_anim_set_exec_cb(&animation, fade_frame);
        lv_anim_set_completed_cb(&animation, fade_complete);
        lv_anim_start(&animation);
    } else lv_obj_set_hidden(faces[outgoing].group, true);
    if (selection_callback) selection_callback(index);
    return true;
}

int selected() { return current.load(); }
} // namespace clock_ui

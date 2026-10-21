#include "board_display.hpp"
#include "bsp/esp-bsp.h"
#include "bsp/display.h"
#include "esp_lcd_touch.h"
#include "bsp/touch.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "esp_lvgl_port_touch.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static void round_area(lv_area_t *area) {
    area->x1 &= ~1; area->y1 &= ~1;
    area->x2 |= 1; area->y2 |= 1;
}

lv_display_t *clock_display_start() {
    ESP_ERROR_CHECK(bsp_i2c_init());
    const auto bus=bsp_i2c_get_handle();
    // TCA9554: LCD reset, display supply and touch reset are bits 0, 1 and 2.
    // Preserve the unconnected/input pins; keep SD CS (bit 7) inactive.
    i2c_master_dev_handle_t expander=nullptr;
    i2c_device_config_t exp_cfg{};exp_cfg.dev_addr_length=I2C_ADDR_BIT_LEN_7;
    exp_cfg.device_address=0x20;exp_cfg.scl_speed_hz=400000;
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus,&exp_cfg,&expander));
    uint8_t direction[]={3,0x78},hold[]={1,0x80},release[]={1,0x87};
    ESP_ERROR_CHECK(i2c_master_transmit(expander,direction,2,100));
    ESP_ERROR_CHECK(i2c_master_transmit(expander,hold,2,100));vTaskDelay(pdMS_TO_TICKS(20));
    ESP_ERROR_CHECK(i2c_master_transmit(expander,release,2,100));vTaskDelay(pdMS_TO_TICKS(150));
    ESP_ERROR_CHECK(i2c_master_bus_rm_device(expander));
    const bool original=i2c_master_probe(bus,0x38,100)==ESP_OK;
    ESP_LOGI("clock_display","Board touch revision: %s",original?"original FT3168":"V2 CST820 family");
    lvgl_port_cfg_t port=ESP_LVGL_PORT_INIT_CONFIG();
    port.task_stack=12288;port.task_affinity=1;port.timer_period_ms=2;
    ESP_ERROR_CHECK(lvgl_port_init(&port));
    esp_lcd_panel_handle_t panel=nullptr;esp_lcd_panel_io_handle_t io=nullptr;
    bsp_display_config_t panel_cfg{};
    ESP_ERROR_CHECK(bsp_display_new(&panel_cfg,&panel,&io));
    lvgl_port_display_cfg_t cfg{};
    cfg.io_handle=io;cfg.panel_handle=panel;
    cfg.buffer_size=368*48;cfg.double_buffer=true;
    cfg.hres=368;cfg.vres=448;cfg.color_format=LV_COLOR_FORMAT_RGB565;
    cfg.rounder_cb=round_area;cfg.flags.buff_dma=true;cfg.flags.swap_bytes=true;
    // This is QSPI, not an RGB-parallel panel. Use the SPI port and DMA completion callback.
    lv_display_t *display=lvgl_port_add_disp(&cfg);
    ESP_ERROR_CHECK(display?ESP_OK:ESP_FAIL);
    esp_lcd_touch_handle_t touch=nullptr;
    if(bsp_touch_new(nullptr,&touch)==ESP_OK) {
        lvgl_port_touch_cfg_t touch_cfg{};touch_cfg.disp=display;touch_cfg.handle=touch;
        lvgl_port_add_touch(&touch_cfg);
    } else ESP_LOGW("clock_display","Touch unavailable; USB controls remain available");
    return display;
}

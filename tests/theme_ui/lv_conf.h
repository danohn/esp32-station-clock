#pragma once
#define LV_CONF_H
// Match the firmware's software renderer and bounded layer settings. Host input
// and time are synthetic; no ESP-IDF, screen, USB connection, or network is used.
#define LV_COLOR_FORMAT_DEFAULT LV_COLOR_FORMAT_RGB565
#define LV_USE_OS LV_OS_NONE
#define LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB
#define LV_DRAW_LAYER_SIMPLE_BUF_SIZE 24576
#define LV_DRAW_LAYER_MAX_MEMORY 49152
#define LV_USE_DRAW_SW 1
#define LV_DRAW_SW_DRAW_UNIT_CNT 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_USE_LOG 1
#define LV_LOG_LEVEL LV_LOG_LEVEL_WARN
#define LV_USE_ASSERT_NULL 1
#define LV_USE_ASSERT_MALLOC 1
#define LV_USE_ASSERT_STYLE 1
#define LV_USE_ASSERT_OBJ 1
#define LV_USE_ASSERT_MEM_INTEGRITY 0
#define LV_ASSERT_USE_CUSTOM_INCLUDE 1
#define LV_ASSERT_CUSTOM_INCLUDE <stdlib.h>
#define LV_ASSERT_HANDLER abort();
#define LV_USE_SYSMON 0
#define LV_USE_PERF_MONITOR 0

file(GLOB CLOCK_ASSETS "generated/*.c")
idf_component_register(SRCS "clock_main.cpp" "board_display.cpp" ${CLOCK_ASSETS}
    INCLUDE_DIRS "." REQUIRES esp32_s3_touch_amoled_1_8 lvgl__lvgl
    esp_wifi esp_event esp_netif nvs_flash lwip json esp_timer driver esp_lcd_touch esp_lvgl_port)
idf_build_get_property(build_components BUILD_COMPONENTS)
if("chmorgan__esp-audio-player" IN_LIST build_components)
    idf_component_get_property(AUDIO_PLAYER_LIB chmorgan__esp-audio-player COMPONENT_LIB)
    target_link_libraries(${AUDIO_PLAYER_LIB} PUBLIC idf::esp_driver_i2s)
endif()

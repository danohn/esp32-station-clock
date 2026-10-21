#pragma once
#include <cstdio>
#define ESP_LOGW(tag, message) std::fprintf(stderr, "%s: %s\n", tag, message)

#pragma once

#include <stddef.h>
#include <stdint.h>
#include <common/bk_err.h>

void board_mic_feed(const int16_t *samples, size_t count);
bk_err_t board_mic_record(void);

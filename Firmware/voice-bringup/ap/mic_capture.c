#include <stdatomic.h>

#include <components/log.h>
#include <os/os.h>

#include "mic_capture.h"

#define TAG "boardmic"
#define OUTPUT_RATE 8000
#define RECORD_BYTES (4 * OUTPUT_RATE)
#define CHUNK_BYTES 96
#define CHUNK_INTERVAL_MS 20

static uint8_t recording[RECORD_BYTES];
static atomic_bool capture_active;
static atomic_uint captured;

void board_mic_feed(const int16_t *samples, size_t count)
{
	unsigned int offset;

	if (!atomic_load(&capture_active))
		return;
	offset = atomic_load(&captured);
	for (size_t i = 0; i + 1 < count && offset < sizeof(recording); i += 2) {
		int avg = ((int)samples[i] + samples[i + 1]) / 2;

		recording[offset++] = (avg + 32768) >> 8;
	}
	atomic_store(&captured, offset);
}

static void base64_chunk(char *out, const uint8_t *data, size_t count)
{
	static const char alphabet[] =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

	for (size_t i = 0; i < count; i += 3) {
		unsigned int value = (unsigned int)data[i] << 16;

		if (i + 1 < count)
			value |= (unsigned int)data[i + 1] << 8;
		if (i + 2 < count)
			value |= data[i + 2];
		*out++ = alphabet[value >> 18];
		*out++ = alphabet[(value >> 12) & 63];
		*out++ = i + 1 < count ? alphabet[(value >> 6) & 63] : '=';
		*out++ = i + 2 < count ? alphabet[value & 63] : '=';
	}
	*out = '\0';
}

bk_err_t board_mic_record(void)
{
	char chunk[CHUNK_BYTES / 3 * 4 + 1];

	atomic_store(&captured, 0);
	atomic_store(&capture_active, true);
	BK_LOGI(TAG, "BOARD_CAPTURE_READY rate=%d\r\n", OUTPUT_RATE);
	for (unsigned int elapsed = 0; elapsed < 5000; elapsed += 25) {
		if (atomic_load(&captured) == sizeof(recording))
			break;
		rtos_delay_milliseconds(25);
	}
	atomic_store(&capture_active, false);
	if (atomic_load(&captured) != sizeof(recording)) {
		BK_LOGW(TAG, "BOARD_CAPTURE_ERROR\r\n");
		return BK_FAIL;
	}

	BK_LOGI(TAG, "BOARD_PCM_START %u\r\n", (unsigned int)sizeof(recording));
	for (unsigned int offset = 0; offset < sizeof(recording); offset += CHUNK_BYTES) {
		size_t remaining = sizeof(recording) - offset;
		size_t count = remaining < CHUNK_BYTES ? remaining : CHUNK_BYTES;

		base64_chunk(chunk, recording + offset, count);
		BK_LOGI(TAG, "BOARD_PCM %u %s\r\n", offset, chunk);
		rtos_delay_milliseconds(CHUNK_INTERVAL_MS);
	}
	BK_LOGI(TAG, "BOARD_PCM_END\r\n");
	return BK_OK;
}

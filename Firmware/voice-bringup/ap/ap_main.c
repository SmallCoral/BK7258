#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <bk_private/bk_init.h>
#include <bk_wanson_asr_intf.h>
#include <cli.h>
#include <common/bk_err.h>
#include <components/bk_asr_service.h>
#include <components/bk_audio_asr_service.h>
#include <components/log.h>
#include <driver/gpio.h>
#include <driver/gpio_types.h>
#include <gpio_driver.h>
#include <media_service.h>
#include <os/os.h>

#include <audio_play.h>

#include "lcd_check.h"
#include "mic_capture.h"
#include "prompts.h"

#define TAG "desksprite"
#define SAMPLE_RATE 16000
#define FRAME_SAMPLES (SAMPLE_RATE / 50)
#define FRAME_BYTES (FRAME_SAMPLES * sizeof(int16_t))
#define DAC_GAIN 0x2d /* 0 dB with prompt peaks limited by the build. */

enum prompt_id {
	PROMPT_HELLO,
	PROMPT_GOODBYE,
	PROMPT_RECORD,
};

struct amp_pins {
	gpio_id_t power;
	gpio_id_t shutdown;
};

/* The other pair is unused on each of the two DeskSprite revisions. */
static const struct amp_pins amps[] = {
	{ GPIO_8, GPIO_23 },  /* archived PCB */
	{ GPIO_15, GPIO_14 }, /* revised schematic */
};

static beken_queue_t prompts;
static atomic_int asr_status = ATOMIC_VAR_INIT(-1);
static atomic_uint mic_frames;
static atomic_uint mic_peak;
static atomic_uint recognized;
static atomic_uint played;
static atomic_int playback_error;
static atomic_int playing = ATOMIC_VAR_INIT(-1);
static atomic_bool echo_active;

static void amp_off(void)
{
	for (size_t i = 0; i < sizeof(amps) / sizeof(amps[0]); i++) {
		/* Release SD so the switched rail can discharge without backfeed. */
		bk_gpio_set_output_high(amps[i].shutdown);
		bk_gpio_disable_output(amps[i].shutdown);
		bk_gpio_set_output_low(amps[i].power);
	}
}

static bk_err_t amp_init(void)
{
	bk_err_t ret;

	for (size_t i = 0; i < sizeof(amps) / sizeof(amps[0]); i++) {
		gpio_dev_unmap(amps[i].shutdown);
		gpio_dev_unmap(amps[i].power);
		bk_gpio_disable_pull(amps[i].shutdown);
		bk_gpio_disable_pull(amps[i].power);
		ret = bk_gpio_disable_output(amps[i].shutdown);
		if (ret != BK_OK)
			return ret;
		ret = bk_gpio_set_output_value(amps[i].power, false);
		if (ret != BK_OK)
			return ret;
	}
	return BK_OK;
}

static bk_err_t amp_on(void)
{
	bk_err_t ret;

	for (size_t i = 0; i < sizeof(amps) / sizeof(amps[0]); i++) {
		ret = bk_gpio_set_output_high(amps[i].power);
		if (ret != BK_OK)
			return ret;
	}
	/* The board's pull-up holds the amplifier in shutdown during power-up. */
	rtos_delay_milliseconds(40);
	for (size_t i = 0; i < sizeof(amps) / sizeof(amps[0]); i++) {
		ret = bk_gpio_set_output_value(amps[i].shutdown, false);
		if (ret != BK_OK)
			return ret;
	}
	rtos_delay_milliseconds(30);
	return BK_OK;
}

static bk_err_t play_prompt(enum prompt_id id)
{
	const int16_t *pcm = id == PROMPT_HELLO ? hello_pcm : goodbye_pcm;
	size_t count = id == PROMPT_HELLO ? HELLO_SAMPLES : GOODBYE_SAMPLES;
	audio_play_cfg_t config = DEFAULT_AUDIO_PLAY_CONFIG();
	int16_t frame[FRAME_SAMPLES];
	audio_play_t *speaker;
	bk_err_t ret;

	config.sampRate = SAMPLE_RATE;
	config.volume = DAC_GAIN;
	config.frame_size = FRAME_BYTES;
	config.pool_size = 2 * config.frame_size;
	speaker = audio_play_create(AUDIO_PLAY_ONBOARD_SPEAKER, &config);
	if (!speaker)
		return BK_FAIL;

	ret = audio_play_open(speaker);
	if (ret != BK_OK)
		goto destroy;

	ret = amp_on();
	if (ret != BK_OK)
		goto close;
	for (size_t offset = 0; offset < count; offset += FRAME_SAMPLES) {
		size_t samples = count - offset;

		if (samples > FRAME_SAMPLES)
			samples = FRAME_SAMPLES;
		memset(frame, 0, sizeof(frame));
		memcpy(frame, pcm + offset, samples * sizeof(*pcm));
		if (audio_play_write_data(speaker, (char *)frame, sizeof(frame)) !=
		    sizeof(frame)) {
			ret = BK_FAIL;
			goto close;
		}
	}
	/* Two pool frames, two DMA frames, and one scheduler margin. */
	rtos_delay_milliseconds(100);

close:
	amp_off();
	if (audio_play_close(speaker) != BK_OK)
		ret = BK_FAIL;
destroy:
	audio_play_destroy(speaker);
	return ret;
}

static int recognize(void *buffer, uint32_t size, void *text, void *score)
{
	const int16_t *samples = buffer;
	unsigned int peak = 0;
	unsigned int previous;

	for (size_t i = 0; i < size / sizeof(*samples); i++) {
		int sample = samples[i];
		unsigned int magnitude = sample < 0 ? -sample : sample;

		if (magnitude > peak)
			peak = magnitude;
	}
	previous = atomic_load(&mic_peak);
	while (peak > previous &&
	       !atomic_compare_exchange_weak(&mic_peak, &previous, peak))
		;
	atomic_fetch_add(&mic_frames, 1);
	board_mic_feed(samples, size / sizeof(*samples));
	return bk_wanson_asr_recog(buffer, size, text, score);
}

static void on_word(uint32_t result)
{
	const char *word = (const char *)(uintptr_t)result;
	enum prompt_id prompt;

	if (atomic_load(&playing) >= 0)
		return;
	BK_LOGI(TAG, "heard=%s\r\n", word);
	if (strcmp(word, "你好阿米诺") == 0)
		prompt = PROMPT_HELLO;
	else if (strcmp(word, "再见阿米诺") == 0)
		prompt = PROMPT_GOODBYE;
	else
		return;

	atomic_fetch_add(&recognized, 1);
	BK_LOGI(TAG, "recognized=%s\r\n", word);
	rtos_push_to_queue(&prompts, &prompt, BEKEN_NO_WAIT);
}

static bk_err_t start_asr(bool hardware_echo_cancel)
{
	asr_cfg_t mic = ASR_BY_ONBOARD_MIC_CFG_DEFAULT();
	aud_asr_cfg_t config = AUDIO_ASR_CFG_DEFAULT();
	asr_handle_t capture;
	aud_asr_handle_t engine;
	bk_err_t ret;

	mic.mic_cfg.onboard_mic_cfg.adc_cfg.sample_rate = SAMPLE_RATE;
	mic.mic_cfg.onboard_mic_cfg.frame_size = FRAME_BYTES;
	mic.mic_cfg.onboard_mic_cfg.out_block_size = FRAME_BYTES;
	mic.mic_cfg.onboard_mic_cfg.out_block_num = 4;
	mic.read_pool_size = FRAME_BYTES;
	mic.asr_en = true;
	if (hardware_echo_cancel) {
		/* MIC2 is the electrical reference from the BTL speaker output. */
		mic.mic_cfg.onboard_mic_cfg.adc_cfg.chl_num = 2;
		mic.mic_cfg.onboard_mic_cfg.frame_size = 2 * FRAME_BYTES;
		mic.mic_cfg.onboard_mic_cfg.out_block_size = 2 * FRAME_BYTES;
		mic.aec_en = true;
		mic.aec_cfg.aec_alg_cfg.aec_cfg.mode = AEC_MODE_HARDWARE;
		mic.aec_cfg.aec_alg_cfg.aec_cfg.fs = SAMPLE_RATE;
		mic.aec_cfg.aec_alg_cfg.aec_cfg.ns_type = NS_CLOSE;
		mic.aec_cfg.aec_alg_cfg.aec_cfg.ec_depth = 20;
		mic.aec_cfg.aec_alg_cfg.vad_cfg.vad_enable = 0;
	}
	capture = bk_asr_create(&mic);
	if (!capture)
		return BK_FAIL;
	ret = bk_asr_init_with_mic(&mic, capture);
	if (ret != BK_OK)
		goto release_capture;

	config.asr_handle = capture;
	config.aud_asr_init = bk_wanson_asr_common_init;
	config.aud_asr_deinit = bk_wanson_asr_common_deinit;
	config.aud_asr_recog = recognize;
	config.aud_asr_result_handle = on_word;
	engine = bk_aud_asr_init(&config);
	if (!engine) {
		ret = BK_FAIL;
		goto release_capture;
	}
	ret = bk_asr_start(capture);
	if (ret != BK_OK)
		goto release_engine;
	ret = bk_aud_asr_start(engine);
	if (ret == BK_OK)
		return ret;
	bk_asr_stop(capture);

release_engine:
	bk_aud_asr_deinit(engine);
release_capture:
	bk_asr_deinit(capture);
	return ret;
}

static void voice_task(beken_thread_arg_t arg)
{
	enum prompt_id prompt;
	bk_err_t amp_status = amp_init();
	bk_err_t ret = start_asr(true);
	bool echo_cancel = ret == BK_OK;

	(void)arg;
	if (!echo_cancel)
		ret = start_asr(false);
	atomic_store(&asr_status, ret);
	atomic_store(&echo_active, echo_cancel);
	BK_LOGI(TAG, "voice check: microphone=%d amplifier=%d echo_cancel=%u\r\n",
		ret, amp_status, (unsigned int)echo_cancel);
	for (;;) {
		if (rtos_pop_from_queue(&prompts, &prompt, BEKEN_WAIT_FOREVER) != BK_OK)
			continue;
		atomic_store(&playing, prompt);
		if (prompt == PROMPT_RECORD) {
			board_mic_record();
			atomic_store(&playing, -1);
			continue;
		}
		ret = amp_status == BK_OK ? play_prompt(prompt) : amp_status;
		atomic_store(&playback_error, ret);
		if (ret == BK_OK)
			atomic_fetch_add(&played, 1);
		BK_LOGI(TAG, "playback=%d result=%d\r\n", prompt, ret);
		atomic_store(&playing, -1);
	}
}

static void voice_command(char *out, int capacity, int argc, char **argv)
{
	enum prompt_id prompt;
	bk_err_t ret;

	if (argc == 1) {
		snprintf(out, capacity,
			 "BOARD_STATUS asr=%d echo=%u frames=%u peak=%u words=%u played=%u error=%d\r\n",
			 atomic_load(&asr_status), (unsigned int)atomic_load(&echo_active),
			 atomic_load(&mic_frames), atomic_exchange(&mic_peak, 0),
			 atomic_load(&recognized), atomic_load(&played), atomic_load(&playback_error));
		return;
	}

	if (argc == 2 && strcmp(argv[1], "record") == 0) {
		if (atomic_load(&asr_status) != BK_OK || atomic_load(&playing) >= 0) {
			snprintf(out, capacity, "BOARD_BUSY\r\n");
			return;
		}
		prompt = PROMPT_RECORD;
	} else if (argc == 2 && strcmp(argv[1], "play") == 0) {
		prompt = PROMPT_HELLO;
	} else if (argc == 3 && strcmp(argv[1], "play") == 0 && strcmp(argv[2], "goodbye") == 0) {
		prompt = PROMPT_GOODBYE;
	} else {
		snprintf(out, capacity, "Usage: voicecheck [record|play [goodbye]]\r\n");
		return;
	}
	ret = rtos_push_to_queue(&prompts, &prompt, BEKEN_NO_WAIT);
	snprintf(out, capacity, "BOARD_QUEUED=%d\r\n", ret);
}

static const struct cli_command commands[] = {
	{ "voicecheck", "voicecheck [record|play [goodbye]]", voice_command },
	{ "lcdcheck", "lcdcheck [status]", lcd_check_command },
};

int main(void)
{
	beken_thread_t thread;
	bk_err_t ret;

	bk_init();
	media_service_init();
	ret = rtos_init_queue(&prompts, "voice prompts", sizeof(enum prompt_id), 2);
	if (ret != BK_OK)
		return ret;
	ret = rtos_create_thread(&thread, 4, "voice check", voice_task, 3072, 0);
	if (ret != BK_OK) {
		rtos_deinit_queue(&prompts);
		return ret;
	}
	cli_register_commands(commands, sizeof(commands) / sizeof(commands[0]));
	return 0;
}

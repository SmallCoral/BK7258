#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <components/log.h>
#include <driver/gpio.h>
#include <driver/pwm.h>
#include <driver/spi.h>
#include <gpio_driver.h>
#include <os/os.h>

#include "lcd_check.h"

/* Input and control nets of the routed DeskSprite PCB. */
#define LCD_SPI SPI_ID_1
#define LCD_CS_N GPIO_3
#define LCD_DC GPIO_5
#define LCD_RST_N GPIO_6
#define LCD_PWR_EN GPIO_7
#define LCD_BL_N GPIO_25
#define LCD_BL_PWM PWM_ID_5
#define LCD_WIDTH 240
#define LCD_HEIGHT 320
#define LCD_TEST_MS 15000
#define LCD_PWM_PERIOD 26000
#define TAG "lcdcheck"

static atomic_bool running;
static atomic_int result;

static void lcd_gpio_output(gpio_id_t pin, bool level)
{
	gpio_dev_unmap(pin);
	bk_gpio_disable_input(pin);
	bk_gpio_disable_pull(pin);
	if (level)
		bk_gpio_set_output_high(pin);
	else
		bk_gpio_set_output_low(pin);
	bk_gpio_enable_output(pin);
}

static bk_err_t lcd_write(uint8_t command, const uint8_t *data, size_t length)
{
	bk_err_t ret;

	bk_gpio_set_output_low(LCD_DC);
	bk_gpio_set_output_low(LCD_CS_N);
	ret = bk_spi_write_bytes(LCD_SPI, &command, 1);
	bk_gpio_set_output_high(LCD_DC);
	if (ret == BK_OK && length)
		ret = bk_spi_write_bytes(LCD_SPI, data, length);
	bk_gpio_set_output_high(LCD_CS_N);
	return ret;
}

static bk_err_t lcd_draw_test(void)
{
	static const struct {
		uint8_t command;
		uint8_t length;
		uint8_t data[4];
	} setup[] = {
		{ 0x36, 1, { 0x00 } }, /* MADCTL */
		{ 0x3a, 1, { 0x55 } }, /* RGB565 */
		{ 0x21, 0, { 0 } },    /* INVON */
		{ 0x13, 0, { 0 } },    /* NORON */
		{ 0x2a, 4, { 0, 0, (LCD_WIDTH - 1) >> 8, (LCD_WIDTH - 1) & 0xff } },
		{ 0x2b, 4, { 0, 0, (LCD_HEIGHT - 1) >> 8, (LCD_HEIGHT - 1) & 0xff } },
	};
	static const uint16_t colors[] = { 0xf800, 0x07e0, 0x001f, 0xffff };
	uint8_t row[LCD_WIDTH * 2];
	uint8_t ram_write = 0x2c;
	bk_err_t ret;

	ret = lcd_write(0x11, NULL, 0); /* SLPOUT */
	if (ret != BK_OK)
		return ret;
	rtos_delay_milliseconds(120);

	for (unsigned int i = 0; i < sizeof(setup) / sizeof(setup[0]); i++) {
		ret = lcd_write(setup[i].command, setup[i].data, setup[i].length);
		if (ret != BK_OK)
			return ret;
	}

	for (unsigned int x = 0; x < LCD_WIDTH; x++) {
		uint16_t color = colors[x / (LCD_WIDTH / 4)];

		row[2 * x] = color >> 8;
		row[2 * x + 1] = color;
	}

	bk_gpio_set_output_low(LCD_DC);
	bk_gpio_set_output_low(LCD_CS_N);
	ret = bk_spi_write_bytes(LCD_SPI, &ram_write, 1);
	bk_gpio_set_output_high(LCD_DC);
	for (unsigned int y = 0; ret == BK_OK && y < LCD_HEIGHT; y++)
		ret = bk_spi_write_bytes(LCD_SPI, row, sizeof(row));
	bk_gpio_set_output_high(LCD_CS_N);
	if (ret != BK_OK)
		return ret;

	return lcd_write(0x29, NULL, 0); /* DISPON */
}

static void lcd_check_task(beken_thread_arg_t arg)
{
	const spi_config_t spi = {
		.role = SPI_ROLE_MASTER,
		.bit_width = SPI_BIT_WIDTH_8BITS,
		.polarity = SPI_POLARITY_LOW,
		.phase = SPI_PHASE_1ST_EDGE,
		.wire_mode = SPI_4WIRE_MODE,
		.baud_rate = 4000000,
		.bit_order = SPI_MSB_FIRST,
	};
	const pwm_init_config_t pwm = {
		.period_cycle = LCD_PWM_PERIOD,
		.duty_cycle = LCD_PWM_PERIOD * 9 / 10,
	};
	bool spi_ready = false;
	bool pwm_ready = false;
	bk_err_t ret;

	(void)arg;
	lcd_gpio_output(LCD_PWR_EN, false);
	lcd_gpio_output(LCD_BL_N, true);
	lcd_gpio_output(LCD_RST_N, false);
	lcd_gpio_output(LCD_CS_N, false);
	lcd_gpio_output(LCD_DC, false);
	bk_gpio_set_output_high(LCD_PWR_EN);
	rtos_delay_milliseconds(35);

	ret = bk_spi_driver_init();
	if (ret != BK_OK)
		goto out;
	ret = bk_spi_init(LCD_SPI, &spi);
	if (ret != BK_OK)
		goto out;
	spi_ready = true;
	/* The panel uses GPIO5 as D/C and has no read-back data line. */
	lcd_gpio_output(LCD_DC, false);
	lcd_gpio_output(LCD_CS_N, true);
	bk_gpio_set_output_high(LCD_RST_N);
	rtos_delay_milliseconds(125);

	ret = lcd_draw_test();
	if (ret != BK_OK)
		goto out;
	BK_LOGI(TAG, "LCD_PATTERN_WRITTEN\r\n");

	ret = bk_pwm_driver_init();
	if (ret != BK_OK)
		goto out;
	ret = bk_pwm_init(LCD_BL_PWM, &pwm);
	if (ret != BK_OK)
		goto out;
	pwm_ready = true;
	ret = bk_pwm_set_init_signal_high(LCD_BL_PWM);
	if (ret != BK_OK)
		goto out;
	ret = bk_pwm_start(LCD_BL_PWM);
	if (ret != BK_OK)
		goto out;
	BK_LOGI(TAG, "LCD_BACKLIGHT_ON duty=10%% duration_ms=%d\r\n", LCD_TEST_MS);
	rtos_delay_milliseconds(LCD_TEST_MS);

out:
	if (pwm_ready) {
		bk_pwm_stop(LCD_BL_PWM);
		bk_pwm_deinit(LCD_BL_PWM);
	}
	lcd_gpio_output(LCD_BL_N, true);
	if (spi_ready)
		bk_spi_deinit(LCD_SPI);
	lcd_gpio_output(LCD_CS_N, false);
	lcd_gpio_output(LCD_DC, false);
	bk_gpio_set_output_low(LCD_RST_N);
	bk_gpio_set_output_low(LCD_PWR_EN);
	BK_LOGI(TAG, "LCD_DONE result=%d\r\n", ret);
	atomic_store(&result, ret);
	atomic_store(&running, false);
	rtos_delete_thread(NULL);
}

void lcd_check_command(char *out, int capacity, int argc, char **argv)
{
	beken_thread_t thread;
	bk_err_t ret;

	if (argc == 2 && !strcmp(argv[1], "status")) {
		snprintf(out, capacity, "LCD_STATUS running=%u result=%d\r\n",
			 (unsigned int)atomic_load(&running), atomic_load(&result));
		return;
	}
	if (argc != 1) {
		snprintf(out, capacity, "Usage: lcdcheck [status]\r\n");
		return;
	}
	if (atomic_exchange(&running, true)) {
		snprintf(out, capacity, "LCD_BUSY\r\n");
		return;
	}
	ret = rtos_create_thread(&thread, 4, "lcd check", lcd_check_task, 2048, 0);
	if (ret != BK_OK) {
		atomic_store(&result, ret);
		atomic_store(&running, false);
	}
	snprintf(out, capacity, "LCD_QUEUED=%d\r\n", ret);
}

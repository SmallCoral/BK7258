armino_component_register(
    SRCS ap_main.c lcd_check.c mic_capture.c
    PRIV_REQUIRES audio_play bk_asr_service bk_libs media_service avdk_utils
)

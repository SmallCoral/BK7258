"""Receive status and on-demand microphone samples over the USB serial port."""

import base64
import re
import time
import wave
from array import array

import serial

SAMPLES = 32000


def serial_link(port, timeout):
    link = serial.Serial(port=None, baudrate=115200, timeout=timeout, write_timeout=0.2)
    link.dtr = False
    link.rts = False
    link.port = port
    return link


def status(port):
    try:
        with serial_link(port, 0.06) as link:
            link.reset_input_buffer()
            link.write(b"ap_cmd voicecheck\r\n")
            deadline = time.monotonic() + 0.4
            while time.monotonic() < deadline:
                line = link.readline(512)
                match = re.search(rb"(VOICE|BOARD)_STATUS asr=(-?\d+) .*?frames=(\d+)", line)
                if match:
                    return {
                        "online": True, "port": port, "frames": int(match[3]),
                        "microphone": match[1] == b"BOARD" and int(match[2]) == 0,
                    }
    except (OSError, serial.SerialException):
        pass
    return {"online": False, "port": port, "microphone": False}


def capture(port, cancelled):
    audio = bytearray()
    announced = False
    try:
        with serial_link(port, 0.12) as link:
            link.reset_input_buffer()
            link.write(b"ap_cmd voicecheck record\r\n")
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline and not cancelled.is_set():
                line = link.readline(512)
                if b"BOARD_BUSY" in line:
                    raise RuntimeError("BK7258 麦克风忙，请等当前动作结束。")
                if b"BOARD_CAPTURE_ERROR" in line:
                    raise RuntimeError("BK7258 未采到完整语音。")
                if f"BOARD_PCM_START {SAMPLES}".encode() in line:
                    announced = True
                if not announced:
                    continue
                if b"BOARD_PCM_END" in line:
                    if len(audio) == SAMPLES:
                        return audio
                    raise RuntimeError("BK7258 语音数据长度不完整。")
                chunk = re.search(rb"BOARD_PCM (\d+) ([A-Za-z0-9+/=]+)", line)
                if chunk:
                    if int(chunk[1]) != len(audio):
                        raise RuntimeError("BK7258 串口录音丢包，请重试。")
                    audio.extend(base64.b64decode(chunk[2], validate=True))
                    if len(audio) > SAMPLES:
                        raise RuntimeError("BK7258 串口录音长度异常。")
    except (OSError, serial.SerialException) as error:
        raise RuntimeError("无法读取 BK7258 串口。") from error
    if cancelled.is_set():
        return None
    raise RuntimeError("BK7258 录音上传超时。")


def write_wave(path, samples):
    pcm = array("h")
    for index, sample in enumerate(samples):
        current = (sample - 128) * 256
        following = (samples[min(index + 1, len(samples) - 1)] - 128) * 256
        pcm.extend((current, (current + following) // 2))
    with wave.open(str(path), "wb") as stream:
        stream.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        stream.writeframes(pcm.tobytes())

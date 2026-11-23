#!/usr/bin/env python3
"""Stage a DeskSprite voice test project from the Beken SMP SDK example."""

import argparse
import math
import shutil
import struct
import subprocess
import wave
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
SDK_REVISION = "c3b560f3b972db7bf3883edaffa3b49060a865cd"
SAMPLE_RATE = 16000
PROMPT_PEAK = round(0.70 * 32767)


def condition_prompt(samples):
    """Lift quiet syllables while limiting the peak presented to the DAC."""
    high_pass = math.exp(-2 * math.pi * 180 / SAMPLE_RATE)
    attack = math.exp(-1 / (0.004 * SAMPLE_RATE))
    release = math.exp(-1 / (0.060 * SAMPLE_RATE))
    threshold = 2600
    previous = filtered = envelope = 0.0
    compressed = []
    for sample in samples:
        filtered = high_pass * (filtered + sample - previous)
        previous = sample
        magnitude = abs(filtered)
        smoothing = attack if magnitude > envelope else release
        envelope = smoothing * envelope + (1 - smoothing) * magnitude
        gain = (threshold / max(envelope, threshold)) ** (2 / 3)
        compressed.append(filtered * gain)

    peak = max(map(abs, compressed), default=0)
    if peak == 0:
        raise ValueError("the prompt is silent")
    return [round(sample * PROMPT_PEAK / peak) for sample in compressed]


def prompt_array(name):
    with wave.open(str(PROJECT / f"{name}.wav"), "rb") as stream:
        if (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) != (
            1, 2, SAMPLE_RATE
        ):
            raise ValueError(f"{name}.wav must be 16 kHz mono PCM16")
        pcm = stream.readframes(stream.getnframes())
    values = condition_prompt(sample for (sample,) in struct.iter_unpack("<h", pcm))
    rows = [
        "\t" + ", ".join(map(str, values[start:start + 12])) + ","
        for start in range(0, len(values), 12)
    ]
    symbol = name.upper()
    return (
        f"#define {symbol}_SAMPLES {len(values)}\n"
        f"static const int16_t {name}_pcm[{symbol}_SAMPLES] = {{\n"
        + "\n".join(rows)
        + "\n};\n"
    )


def set_config(path, overrides):
    lines = []
    for line in path.read_text().splitlines():
        symbol = line.removeprefix("# ").split("=", 1)[0].split(" ", 1)[0]
        if symbol not in overrides:
            lines.append(line)
    for symbol, value in overrides.items():
        lines.append(f"# {symbol} is not set" if value == "n" else f"{symbol}={value}")
    path.write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sdk", type=Path)
    parser.add_argument("build_directory", type=Path)
    parser.add_argument("--toolchain", type=Path, help="Directory containing arm-none-eabi-gcc")
    args = parser.parse_args()
    sdk = args.sdk.resolve()
    revision = subprocess.check_output(["git", "-C", sdk, "rev-parse", "HEAD"], text=True).strip()
    if revision != SDK_REVISION:
        parser.error(f"expected Beken SDK at {SDK_REVISION}, found {revision}")

    work = args.build_directory.resolve() / "desksprite_voice"
    template = sdk / "projects/asr_service_example"
    for name in ("Makefile", "CMakeLists.txt", "pj_config.mk", ".it.csv"):
        work.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template / name, work / name)
    for name in ("ap/config", "cp/config", "partitions"):
        shutil.copytree(template / name, work / name, dirs_exist_ok=True)
    for core in ("ap", "cp"):
        for name in ("CMakeLists.txt", f"{core}_main.c"):
            shutil.copyfile(PROJECT / core / name, work / core / name)
    for name in ("lcd_check.c", "lcd_check.h", "mic_capture.c", "mic_capture.h"):
        shutil.copyfile(PROJECT / "ap" / name, work / "ap" / name)
    partitions = work / "partitions/bk7258/auto_partitions.csv"
    config = partitions.read_text()
    if "primary_ap_app,,1564k,code" not in config:
        raise ValueError("Unexpected AP partition layout in the SDK template")
    partitions.write_text(config.replace("primary_ap_app,,1564k,code", "primary_ap_app,,3060k,code"))
    (work / "ap/prompts.h").write_text(
        "#pragma once\n#include <stdint.h>\n\n"
        + prompt_array("hello") + "\n" + prompt_array("goodbye")
    )
    set_config(work / "ap/config/bk7258_ap/config", {
        "CONFIG_AUDIO_PLAY": "y",
        "CONFIG_PWM": "y",
        "CONFIG_ASR_SERVICE_NO_MIC": "n",
        "CONFIG_ASR_SERVICE_WITH_MIC": "y",
        "CONFIG_AUD_ASR_READ_SERVICE": "y",
        "CONFIG_WANSON_ASR_GROUP_VERSION_WORDS_V1": "n",
        "CONFIG_WANSON_ASR_GROUP_VERSION_WORDS_V2": "y",
        "CONFIG_VOICE_SERVICE_TEST": "n",
    })

    command = ["make", "bk7258", f"SDK_DIR={sdk}"]
    if args.toolchain is not None:
        command.append(f"COMPILER_TOOLCHAIN_PATH={args.toolchain.resolve()}")
    subprocess.run(command, cwd=work, check=True)
    image = work / "build/bk7258/desksprite_voice/package/all-app.bin"
    if not image.is_file():
        raise FileNotFoundError(image)
    print(image)


if __name__ == "__main__":
    main()

"""Windows volume, media and local speech."""

import asyncio
import json
import os
import subprocess
from pathlib import Path
from threading import Lock

import comtypes
from pycaw.pycaw import AudioUtilities
from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager

SPEECH_SOURCE = Path(__file__).with_name("Speech.cs")
SPEECH_EXE = SPEECH_SOURCE.parent / "build" / "Speech.exe"
WINDOWS = Path(os.environ["WINDIR"])
BUILD_LOCK = Lock()


def volume(percent=None):
    comtypes.CoInitialize()
    try:
        endpoint = AudioUtilities.GetSpeakers().EndpointVolume
        if percent is not None:
            endpoint.SetMasterVolumeLevelScalar(percent / 100, None)
        return round(endpoint.GetMasterVolumeLevelScalar() * 100)
    finally:
        comtypes.CoUninitialize()


async def _media(action):
    manager = await GlobalSystemMediaTransportControlsSessionManager.request_async()
    session = manager.get_current_session()
    if session is None:
        raise RuntimeError("Windows 当前没有可控制的媒体会话。")
    method = {
        "pause": session.try_pause_async,
        "play": session.try_play_async,
        "next": session.try_skip_next_async,
        "previous": session.try_skip_previous_async,
    }[action]
    if not await method():
        raise RuntimeError("当前播放器未接受该操作。")


def media(action):
    asyncio.run(asyncio.wait_for(_media(action), timeout=4))


def build_speech():
    with BUILD_LOCK:
        if SPEECH_EXE.is_file() and SPEECH_EXE.stat().st_mtime >= SPEECH_SOURCE.stat().st_mtime:
            return
        compiler = WINDOWS / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe"
        gac = WINDOWS / "Microsoft.NET" / "assembly" / "GAC_MSIL"
        speech = next((gac / "System.Speech").glob("*/System.Speech.dll"), None)
        if speech is None:
            raise RuntimeError("找不到 Windows 语音组件 System.Speech。")
        SPEECH_EXE.parent.mkdir(exist_ok=True)
        build = subprocess.run(
            [str(compiler), "/nologo", "/codepage:65001", f"/out:{SPEECH_EXE}",
             f"/reference:{speech}", str(SPEECH_SOURCE)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=12,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if build.returncode:
            raise RuntimeError("Windows 语音组件编译失败。")


def speech_process(mode):
    build_speech()
    return subprocess.Popen(
        [str(SPEECH_EXE), mode],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW,
    )


def speech_result(process, payload, timeout=12):
    try:
        output, _ = process.communicate(json.dumps(payload, ensure_ascii=False), timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise RuntimeError("Windows 语音服务响应超时。") from None
    if not output.strip():
        if process.returncode:
            raise RuntimeError("Windows 语音服务启动失败。")
        return {}
    result = json.loads(output)
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result

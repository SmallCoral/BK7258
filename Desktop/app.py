"""DeskSprite tray application and local dashboard."""

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Lock, RLock, Thread
from urllib.error import URLError
from urllib.request import urlopen

import psutil

import board
import windows

ROOT = Path(__file__).resolve().parent
PORT = 8765
ADDRESS = f"http://127.0.0.1:{PORT}"
MEDIA = {
    "暂停播放": ("pause", "已请求暂停播放。"),
    "继续播放": ("play", "已请求继续播放。"),
    "下一首": ("next", "播放器已接受下一首指令。"),
    "上一首": ("previous", "播放器已接受上一首指令。"),
}
QUERIES = {
    "电脑状态": "summary", "现在电脑怎么样": "summary",
    "CPU用了多少": "cpu", "处理器占用多少": "cpu",
    "现在内存用了多少": "memory", "内存占用多少": "memory",
    "现在网速多少": "network", "网速怎么样": "network",
    "哪个程序占用最高": "process", "哪个程序最占CPU": "process",
}
NUMBER = "零一二三四五六七八九"


def chinese_number(value):
    if value < 10:
        return NUMBER[value]
    if value == 100:
        return "一百"
    tens, ones = divmod(value, 10)
    return (NUMBER[tens] if tens > 1 else "") + "十" + (NUMBER[ones] if ones else "")


def normalize(message):
    return re.sub(r"[\s。！，、,.!?？]+", "", message).casefold()


class Monitor:
    def __init__(self, stop, port):
        self.latest = {}
        self.board = {"online": False, "port": port, "microphone": False}
        self.serial_lock = Lock()
        Thread(target=self.sample, args=(stop,), daemon=True).start()
        if port:
            Thread(target=self.connect, args=(stop, port), daemon=True).start()

    def connect(self, stop, port):
        while not stop.is_set():
            if self.serial_lock.acquire(blocking=False):
                try:
                    self.board = board.status(port)
                finally:
                    self.serial_lock.release()
            stop.wait(4)

    def sample(self, stop):
        psutil.cpu_percent()
        previous = psutil.net_io_counters()
        last_at = time.monotonic()
        cpus = psutil.cpu_count() or 1
        while not stop.is_set():
            memory = psutil.virtual_memory()
            counter = psutil.net_io_counters()
            now = time.monotonic()
            elapsed = max(0.001, now - last_at)
            processes = []
            for process in psutil.process_iter(["name", "memory_info"], ad_value=None):
                try:
                    info = process.info
                    if process.pid == 0 or info["name"] is None:
                        continue
                    used = info["memory_info"].rss if info["memory_info"] else 0
                    cpu = process.cpu_percent() / cpus
                    processes.append({"pid": process.pid, "name": info["name"],
                                      "cpu": round(cpu, 1), "memory": used})
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            processes.sort(key=lambda row: (-row["cpu"], -row["memory"]))
            self.latest = {
                "timestamp": time.time(),
                "cpu": psutil.cpu_percent(),
                "memory": memory.percent,
                "memory_used": memory.total - memory.available,
                "memory_total": memory.total,
                "download": max(0, counter.bytes_recv - previous.bytes_recv) / elapsed
                if counter and previous else 0,
                "upload": max(0, counter.bytes_sent - previous.bytes_sent) / elapsed
                if counter and previous else 0,
                "processes": processes[:6],
            }
            last_at, previous = now, counter
            stop.wait(1.2)


class DeskSprite:
    def __init__(self, config):
        self.config = config
        self.closed = Event()
        self.monitor = Monitor(self.closed, config.get("board_port"))
        self.lock = RLock()
        self.history = deque(maxlen=10)
        self.focus_until = 0
        self.focus_generation = 0
        self.generation = 0
        self.listener = None
        self.board_recording = None
        self.speaker = None
        try:
            self.volume = windows.volume()
        except (OSError, windows.comtypes.COMError):
            self.volume = None
        self.apps = {}
        for key, item in config["apps"].items():
            for phrase in item["phrases"]:
                self.apps[normalize(phrase)] = key
        self.volumes = {f"音量调到百分之{chinese_number(i)}": i for i in range(101)}
        self.phrases = [
            *QUERIES, *MEDIA, *self.volumes,
            "开始工作模式", "进入工作模式", "结束专注", "停止专注", "打断",
            *(phrase for item in config["apps"].values() for phrase in item["phrases"]),
        ]

    def status(self):
        with self.lock:
            listening = self.listener is not None or self.board_recording is not None
            speaking = self.speaker is not None and self.speaker.poll() is None
            return {
                "service": "DeskSprite",
                "metrics": self.monitor.latest,
                "board": self.monitor.board,
                "volume": self.volume,
                "focus_until": self.focus_until,
                "focus_generation": self.focus_generation,
                "speech": "listening" if listening else "speaking" if speaking else "idle",
                "history": list(self.history),
                "apps": [{"name": item["label"], "phrase": item["phrases"][0]}
                         for item in self.config["apps"].values()],
            }

    def launch(self, key):
        item = self.config["apps"][key]
        command = [
            os.path.expandvars(part.replace("{project}", str(ROOT.parent)))
            for part in [item["path"], *item.get("args", [])]
        ]
        if not Path(command[0]).is_file() or not Path(command[0]).is_absolute():
            raise RuntimeError(f"找不到 {item['label']}，请核对设置里的应用路径。")
        subprocess.Popen(command, cwd=ROOT.parent, shell=False)
        return item["label"]

    def query(self, query):
        status = self.monitor.latest
        if not status:
            raise RuntimeError("正在采集电脑状态，稍后再试。")
        cpu = status["cpu"]
        memory = status["memory"]
        if query == "summary":
            return f"CPU 占用 {cpu:.0f}%，内存占用 {memory:.0f}%。"
        if query == "cpu":
            return f"CPU 占用 {cpu:.0f}%。"
        if query == "memory":
            gib = 1024 ** 3
            return (f"内存已用 {status['memory_used']/gib:.1f} GB，"
                    f"共 {status['memory_total']/gib:.1f} GB，使用率 {memory:.0f}%。")
        if query == "network":
            return (f"下载 {status['download']/1024:.0f} KB/s，"
                    f"上传 {status['upload']/1024:.0f} KB/s。")
        if not status["processes"]:
            raise RuntimeError("暂未采集到进程数据。")
        top = status["processes"][0]
        return f"当前 CPU 占用最高的是 {top['name']}，占 {top['cpu']:.1f}%。"

    def dispatch(self, message):
        key = normalize(message)
        for phrase, query in QUERIES.items():
            if key == normalize(phrase):
                return self.query(query)
        if key in MEDIA:
            action, response = MEDIA[key]
            windows.media(action)
            return response
        match = re.fullmatch(r"音量(?:调到|设为)(?:百分之)?(\d{1,3})%?", key)
        if match or key in self.volumes:
            target = int(match[1]) if match else self.volumes[key]
            if target > 100:
                raise ValueError("音量范围为 0 到 100。")
            self.volume = windows.volume(target)
            return f"系统音量已设为 {self.volume}%。"
        if key in self.apps:
            return f"已启动 {self.launch(self.apps[key])}。"
        if key in {"开始工作模式", "进入工作模式"}:
            if self.focus_until > time.time():
                return "工作模式已在运行，沿用当前专注计时。"
            started = []
            errors = []
            for app in self.config["work_mode"]:
                try:
                    started.append(self.launch(app))
                except (RuntimeError, OSError) as error:
                    errors.append(str(error))
            if errors and not started:
                raise RuntimeError(" ".join(errors))
            minutes = self.config["focus_minutes"]
            self.focus_until = time.time() + minutes * 60
            self.focus_generation += 1
            opened = f"已启动 {'、'.join(started)}，" if started else ""
            return f"{opened}开始 {minutes} 分钟专注计时。" + " ".join(errors)
        if key in {"结束专注", "停止专注"}:
            self.focus_until = 0
            self.focus_generation += 1
            return "已结束专注计时。"
        if key == "打断":
            self.stop_voice()
            return "已停止录入和播报。"
        raise ValueError("暂未配置这条指令。")

    def record(self, message, reply, ok, source):
        result = {"text": message, "reply": reply, "ok": ok, "source": source, "at": time.time()}
        self.history.appendleft(result)
        return result

    def command(self, message, source="text"):
        with self.lock:
            try:
                reply = self.dispatch(message)
            except (ValueError, RuntimeError, OSError, TimeoutError) as error:
                return self.record(message, str(error) or "操作超时。", False, source)
            except Exception as error:
                return self.record(message, f"Windows 操作失败。{error}", False, source)
            if source == "voice" and normalize(message) != "打断":
                try:
                    self.speak(reply)
                except OSError:
                    reply += " Windows 播报未启动。"
            return self.record(message, reply, True, source)

    def stop_voice(self):
        with self.lock:
            self.generation += 1
            if self.board_recording is not None:
                self.board_recording.set()
                self.board_recording = None
            for process in (self.listener, self.speaker):
                if process and process.poll() is None:
                    process.kill()
            self.listener = self.speaker = None

    def speak(self, reply):
        if self.speaker and self.speaker.poll() is None:
            self.speaker.kill()
        process = windows.speech_process("speak")
        self.speaker = process
        Thread(target=self.finish_speech, args=(process, reply), daemon=True).start()

    def finish_speech(self, process, reply):
        try:
            windows.speech_result(process, {"text": reply}, timeout=30)
        except (RuntimeError, OSError, ValueError) as error:
            with self.lock:
                if self.speaker is process:
                    self.record("语音播报", str(error), False, "voice")
        finally:
            with self.lock:
                if self.speaker is process:
                    self.speaker = None

    def listen(self, source):
        with self.lock:
            if self.listener is not None or self.board_recording is not None:
                return
            self.stop_voice()
            if source == "board":
                if not self.monitor.board["microphone"]:
                    raise ValueError("BK7258 板载麦克风未连接。")
                self.board_recording = Event()
                Thread(target=self.recognize_board, args=(self.board_recording, self.generation),
                       daemon=True).start()
                return
            if source != "windows":
                raise ValueError("麦克风选项无效。")
            self.listener = windows.speech_process("listen")
            Thread(target=self.recognize,
                   args=(self.listener, self.generation), daemon=True).start()

    def recognize(self, process, generation):
        try:
            result = windows.speech_result(process, {"phrases": self.phrases})
        except (OSError, RuntimeError, ValueError) as exception:
            result = {"error": str(exception)}
        self.finish_recognition(result, generation)

    def recognize_board(self, cancelled, generation):
        try:
            with self.monitor.serial_lock:
                samples = board.capture(self.config["board_port"], cancelled)
            if cancelled.is_set():
                return
            with tempfile.TemporaryDirectory(prefix="desksprite-") as directory:
                path = Path(directory) / "speech.wav"
                board.write_wave(path, samples)
                with self.lock:
                    if generation != self.generation:
                        return
                    process = self.listener = windows.speech_process("recognize-file")
                result = windows.speech_result(process, {"phrases": self.phrases, "path": str(path)})
        except (OSError, RuntimeError, ValueError) as exception:
            result = {"error": str(exception)}
        self.finish_recognition(result, generation)

    def finish_recognition(self, result, generation):
        with self.lock:
            if generation != self.generation:
                return
            self.listener = None
            self.board_recording = None
            message = result.get("text", "")
            error = result.get("error")
            if error:
                self.record("语音输入", error, False, "voice")
            elif not message or result["confidence"] < 0.55:
                self.record("语音输入", "没有听清指令，可以重试。", False, "voice")
            else:
                self.command(message, "voice")


class LocalServer(ThreadingHTTPServer):
    def __init__(self, app):
        self.app = app
        super().__init__(("127.0.0.1", PORT), Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, body, code=200, content="application/json; charset=utf-8"):
        if content.startswith("application/json"):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'")
        try:
            self.end_headers()
            self.wfile.write(body)
        except ConnectionError:
            pass

    def same_host(self):
        return self.headers.get("Host") == f"127.0.0.1:{PORT}"

    def do_GET(self):
        if not self.same_host():
            self.reply({"error": "访问地址无效。"}, 403)
            return
        if self.path == "/api/status":
            self.reply(self.server.app.status())
            return
        files = {"/": ("index.html", "text/html"),
                 "/style.css": ("style.css", "text/css"),
                 "/dashboard.js": ("dashboard.js", "text/javascript")}
        if self.path not in files:
            self.reply({"error": "页面不存在。"}, 404)
            return
        name, mime = files[self.path]
        self.reply((ROOT / "web" / name).read_bytes(), content=f"{mime}; charset=utf-8")

    def do_POST(self):
        if (not self.same_host() or self.headers.get("Origin") not in (None, ADDRESS)
                or self.headers.get("X-DeskSprite") != "1"):
            self.reply({"error": "仅接受本机面板请求。"}, 403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 2048:
                raise ValueError("请求数据无效。")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("请求数据无效。")
            app = self.server.app
            if self.path == "/api/action":
                message = data.get("text")
                if not isinstance(message, str) or not 0 < len(message.strip()) <= 120:
                    raise ValueError("请输入一条指令。")
                self.reply(app.command(message.strip()))
            elif self.path == "/api/listen":
                app.listen(data.get("source", "windows"))
                self.reply({"ok": True})
            elif self.path == "/api/stop":
                app.stop_voice()
                self.reply({"ok": True})
            else:
                self.reply({"error": "操作不存在。"}, 404)
        except (ValueError, OSError, RuntimeError) as error:
            self.reply({"error": str(error)}, 400)


def tray(server):
    import pystray
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (64, 64), "#112322")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((9, 13, 55, 51), radius=11, fill="#73dbbc")
    draw.line([(16, 34), (23, 34), (28, 24), (34, 41), (39, 32), (48, 32)],
              fill="#112322", width=4)

    def close(icon, _):
        server.app.closed.set()
        server.app.stop_voice()
        server.shutdown()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("打开桌灵", lambda: webbrowser.open(ADDRESS), default=True),
        pystray.MenuItem("停止语音", lambda: server.app.stop_voice()),
        pystray.MenuItem("退出", close),
    )
    pystray.Icon("DeskSprite", image, "桌灵 DeskSprite", menu).run()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--no-tray", action="store_true")
    args = parser.parse_args()
    config = json.loads((ROOT / "settings.json").read_text(encoding="utf-8"))
    app = DeskSprite(config)
    try:
        server = LocalServer(app)
    except OSError:
        try:
            with urlopen(f"{ADDRESS}/api/status", timeout=1) as response:
                if json.load(response).get("service") != "DeskSprite":
                    raise RuntimeError("8765 端口已被其他程序占用。")
        except (URLError, ValueError):
            raise RuntimeError("8765 端口已被其他程序占用。") from None
        if not args.no_open:
            webbrowser.open(ADDRESS)
        return
    try:
        if not args.no_open:
            webbrowser.open(ADDRESS)
        if args.no_tray:
            server.serve_forever()
        else:
            Thread(target=server.serve_forever, daemon=True).start()
            tray(server)
    finally:
        app.closed.set()
        app.stop_voice()
        server.server_close()


if __name__ == "__main__":
    main()

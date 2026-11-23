"use strict";

const field = (id) => document.getElementById(id);
const set = (id, value) => { field(id).textContent = value; };
const bytes = (value) => {
  const units = ["B", "KB", "MB", "GB"];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    unit++;
    value /= 1024;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
};
let online = false;
let loading = false;
let submitting = false;
let editingVolume = false;
let focusUntil = Number(localStorage.getItem("desksprite-focus") || 0);
let focusVersion = -1;
let lastHistory = "";
let lastApps = "";

function setOnline(value) {
  online = value;
  set("host-connection", value ? "电脑在线" : "电脑未连接");
  field("host-connection").classList.toggle("online", value);
  document.querySelectorAll("[data-online]").forEach((button) => { button.disabled = !value; });
}

function render(status) {
  const metrics = status.metrics;
  if (metrics.timestamp) {
    set("cpu", `${metrics.cpu.toFixed(0)}%`);
    set("memory", `${metrics.memory.toFixed(0)}%`);
    field("cpu-meter").value = metrics.cpu;
    field("memory-meter").value = metrics.memory;
    set("memory-detail", `${bytes(metrics.memory_used)} / ${bytes(metrics.memory_total)}`);
    set("download", `${bytes(metrics.download)}/s`);
    set("upload", `${bytes(metrics.upload)}/s`);
    set("metrics-time", `更新于 ${new Date(metrics.timestamp * 1000).toLocaleTimeString("zh-CN")}`);
    field("process-empty").hidden = metrics.processes.length > 0;
    field("processes").replaceChildren(...metrics.processes.map((process) => {
      const row = document.createElement("tr");
      for (const value of [process.name, `${process.cpu.toFixed(1)}%`, bytes(process.memory)]) {
        const column = row.insertCell();
        column.textContent = value;
        column.title = value;
      }
      return row;
    }));
  }
  set("board-connection", status.board.online
    ? `BK7258 · ${status.board.port}`
    : status.board.port ? `BK7258 未响应 · ${status.board.port}` : "BK7258 未连接");
  field("board-connection").classList.toggle("online", status.board.online);
  field("board-listen").hidden = !status.board.microphone;
  set("speech-state", {listening: "正在听，请说话", speaking: "正在播报", idle: ""}[status.speech]);
  field("listen").disabled = status.speech === "listening";
  field("board-listen").disabled = status.speech === "listening";
  field("interrupt").disabled = status.speech === "idle";
  if (!editingVolume && status.volume !== null) {
    field("volume").value = status.volume;
    set("volume-value", `${status.volume}%`);
  }
  if (focusVersion !== status.focus_generation) {
    if (focusVersion !== -1 || status.focus_until > 0) rememberFocus(status.focus_until);
    focusVersion = status.focus_generation;
  }

  const apps = JSON.stringify(status.apps);
  if (apps !== lastApps) {
    lastApps = apps;
    field("apps").replaceChildren(...status.apps.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.phrase = item.phrase;
      button.dataset.online = "";
      button.textContent = `打开 ${item.name}`;
      return button;
    }));
  }
  const history = JSON.stringify(status.history);
  if (history !== lastHistory) {
    lastHistory = history;
    field("history").replaceChildren(...status.history.map((entry) => {
      const li = document.createElement("li");
      const label = document.createElement("strong");
      const reply = document.createElement("span");
      label.textContent = entry.text;
      reply.textContent = entry.reply;
      if (!entry.ok) reply.classList.add("failed");
      li.append(label, reply);
      return li;
    }));
  }
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("/api/status", {signal: AbortSignal.timeout(3000)});
    if (!response.ok) throw new Error("电脑未连接");
    setOnline(true);
    render(await response.json());
  } catch {
    setOnline(false);
    set("board-connection", "BK7258 状态未知");
    field("board-connection").classList.remove("online");
    set("speech-state", "");
  } finally {
    loading = false;
  }
}

async function action(path, data = {}) {
  if (!online || submitting) return;
  submitting = true;
  set("request-error", "");
  try {
    const response = await fetch(path, {
      method: "POST", headers: {"Content-Type": "application/json", "X-DeskSprite": "1"},
      body: JSON.stringify(data), signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error((await response.json()).error || "操作请求失败。");
  } catch (error) {
    set("request-error", error.name === "TimeoutError" ? "电脑响应超时。" : error.message);
  } finally {
    submitting = false;
    refresh();
  }
}

function rememberFocus(deadline) {
  focusUntil = deadline;
  localStorage.setItem("desksprite-focus", String(deadline));
  tick();
}

function tick() {
  const date = new Date();
  set("clock", date.toLocaleString("zh-CN", {weekday: "short", hour: "2-digit", minute: "2-digit"}));
  if (!focusUntil) {
    set("timer", "--:--");
    return;
  }
  const seconds = Math.max(0, Math.ceil(focusUntil - date.getTime() / 1000));
  set("timer", [Math.floor(seconds / 60), seconds % 60]
    .map((value) => String(value).padStart(2, "0")).join(":"));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-phrase]");
  if (button) action("/api/action", {text: button.dataset.phrase});
});
field("command").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = field("text");
  const message = input.value.trim();
  if (message && online && !submitting) {
    input.value = "";
    action("/api/action", {text: message});
  }
});
field("listen").addEventListener("click", () => action("/api/listen"));
field("board-listen").addEventListener("click", () => action("/api/listen", {source: "board"}));
field("interrupt").addEventListener("click", () => action("/api/stop"));
field("end-focus").addEventListener("click", () => {
  rememberFocus(0);
  if (online) action("/api/action", {text: "结束专注"});
});
field("volume").addEventListener("input", () => {
  editingVolume = true;
  set("volume-value", `${field("volume").value}%`);
});
field("volume-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await action("/api/action", {text: `音量调到${field("volume").value}%`});
  editingVolume = false;
});
tick();
refresh();
setInterval(tick, 250);
setInterval(refresh, 1250);

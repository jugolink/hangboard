// The per-photo context menu front end.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const LABELS = {
  "zh-CN": {
    copy: "复制",
    open: "打开",
    preview: "快速查看",
    markup: "标注…",
    reveal: "在资源管理器中显示",
    export: "保存到桌面",
    discard: "取下照片",
    "discard-left": "取下左侧所有照片",
    "discard-right": "取下右侧所有照片",
  },
  en: {
    copy: "Copy",
    open: "Open",
    preview: "Quick Look",
    markup: "Mark Up…",
    reveal: "Show in Explorer",
    export: "Save to Desktop",
    discard: "Discard",
    "discard-left": "Take Down Everything to the Left",
    "discard-right": "Take Down Everything to the Right",
  },
};

function updateLanguage(lang) {
  const dict = LABELS[lang] || LABELS["zh-CN"];
  document.querySelectorAll("#menu button").forEach((button) => {
    const action = button.dataset.action;
    if (dict[action]) {
      button.textContent = dict[action];
    }
  });
}

const ACTION = {
  copy: "context_copy",
  open: "context_open",
  preview: "open_preview",
  markup: null,
  reveal: "context_reveal",
  export: "context_export",
  discard: "context_discard",
  "discard-left": "context_discard_left",
  "discard-right": "context_discard_right",
};

async function run(action) {
  if (action === "preview") {
    await invoke("context_preview");
    return;
  }
  if (action === "pin") {
    await invoke("context_pin");
    return;
  }
  if (action === "markup") {
    return;
  }
  if (!ACTION[action]) return;
  await invoke(ACTION[action]);
}

document.querySelectorAll("#menu button").forEach((button) => {
  button.addEventListener("click", () => {
    void run(button.dataset.action);
  });
});

window.addEventListener("blur", () => {
  void invoke("close_context");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void invoke("close_context");
  }
});

async function boot() {
  try {
    const lang = await invoke("get_language");
    if (lang) updateLanguage(lang);
  } catch (_) {}

  await listen("app:language", (event) => {
    updateLanguage(event.payload);
  });
}

boot().catch((error) => console.error("hangboard: context boot failed", error));

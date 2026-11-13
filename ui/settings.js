// Settings Window Frontend: Hotkey Recording and Configuration

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let currentSettings = null;
let recordingTarget = null; // 'region' | 'whole' | null
let customDataDir = undefined; // undefined: unchanged, null: default, string: custom
let defaultDataDir = "";
let customSoundPath = undefined; // undefined: unchanged, null: default, string: custom path

// Raw accelerators currently held by the inputs
let hotkeys = {
  region: "control+alt+KeyH",
  whole: "control+alt+shift+KeyH",
  toggle: "control+alt+KeyL",
};

const I18N = {
  "zh-CN": {
    title: "偏好设置",
    secShortcuts: "快捷键配置",
    lblRegion: "区域截图",
    descRegion: "拖选矩形区域进行截图",
    lblWhole: "全屏截图",
    descWhole: "瞬间截取整个屏幕画面",
    lblToggle: "显示/隐藏晾衣绳",
    descToggle: "快速呼出或收回屏幕顶部的晾衣绳",
    secGeneral: "常规选项",
    lblDataDir: "截图存储目录",
    descDataDir: "修改保存位置将自动迁移已有截图",
    btnBrowseDir: "📂 浏览…",
    defaultDirNote: "(默认)",
    lblClipboard: "自动挂载剪贴板图片",
    descClipboard: "复制图片（包含第三方截图）时自动挂上晾衣绳",
    lblHover: "鼠标悬停展开",
    descHover: "移至屏幕顶部中央 84% 区域、距顶边 8px 内触发下垂",
    lblRevealNew: "新图自动展开与展示",
    descRevealNew: "截图或复制新图片后自动展开绳索并展示 3 秒",
    lblSounds: "提示音效",
    descSounds: "新图片挂上晾衣绳时播放提示音",
    lblSoundPath: "自定义提示音效",
    descSoundPath: "支持选择 .wav 音频文件，留空使用系统默认音效",
    btnBrowseSound: "📂 浏览…",
    btnTestSound: "▶ 试听",
    defaultSoundPlaceholder: "系统默认音效",
    lblAutostart: "开机自启动",
    descAutostart: "登录 Windows 时自动启动 Hangboard",
    secDisplay: "界面与容量",
    lblScale: "尺寸大小",
    descScale: "调整晾衣绳及卡片的大小比例",
    optScaleSm: "小 (0.8x)",
    optScaleMd: "中 (1.0x)",
    optScaleLg: "大 (1.35x)",
    lblKeep: "绳上保留上限",
    descKeep: "超出限制时自动移去最旧的照片（保留钉住的）",
    optKeepFit: "自动适应容量",
    lblLang: "语言 / Language",
    descLang: "界面与托盘显示语言",
    btnOpenFile: "打开原始文件",
    btnReset: "恢复默认",
    btnSave: "保存更改",
    saved: "已保存!",
    saving: "保存中…",
    pressKey: "请按下按键…",
    needModifier: "需包含 Ctrl / Alt / Shift 之一",
  },
  en: {
    title: "Preferences",
    secShortcuts: "Shortcuts",
    lblRegion: "Region Capture",
    descRegion: "Drag a rectangle to capture a portion of the screen",
    lblWhole: "Full Screen Capture",
    descWhole: "Capture the entire active screen immediately",
    lblToggle: "Toggle Clothesline",
    descToggle: "Quickly show or hide the clothesline at the top edge",
    secGeneral: "General",
    lblDataDir: "Screenshot Storage",
    descDataDir: "Changing location will auto-migrate existing photos",
    btnBrowseDir: "📂 Browse…",
    defaultDirNote: "(Default)",
    lblClipboard: "Hang copied images",
    descClipboard: "Automatically hang copied images (including 3rd-party tools) onto the line",
    lblHover: "Reveal on hover",
    descHover: "Drop the line when the pointer enters the top 8 px band of the central 84%",
    lblRevealNew: "Reveal on new photo",
    descRevealNew: "Auto-drop line and display newly hung photo for 3s",
    lblSounds: "Sound effects",
    descSounds: "Play subtle chime when a photo hangs on the line",
    lblSoundPath: "Custom Sound Effect",
    descSoundPath: "Choose a .wav audio file, or leave empty for default chime",
    btnBrowseSound: "📂 Browse…",
    btnTestSound: "▶ Test",
    defaultSoundPlaceholder: "System default chime",
    lblAutostart: "Open at login",
    descAutostart: "Launch Hangboard when signing in to Windows",
    secDisplay: "Appearance & Capacity",
    lblScale: "Size Scale",
    descScale: "Adjust dimensions of the clothesline and cards",
    optScaleSm: "Small (0.8x)",
    optScaleMd: "Medium (1.0x)",
    optScaleLg: "Large (1.35x)",
    lblKeep: "Keep on line",
    descKeep: "Maximum photos to hold before oldest unpinned fall",
    optKeepFit: "As many as fit",
    lblLang: "Language",
    descLang: "UI and tray menu display language",
    btnOpenFile: "Open settings.json",
    btnReset: "Restore Defaults",
    btnSave: "Save Changes",
    saved: "Saved!",
    saving: "Saving…",
    pressKey: "Press keys…",
    needModifier: "Must include Ctrl, Alt, or Shift",
  },
};

function updateLanguage(lang) {
  const t = I18N[lang] || I18N["zh-CN"];
  document.getElementById("title-text").textContent = t.title;
  document.getElementById("sec-shortcuts").textContent = t.secShortcuts;
  document.getElementById("lbl-region").textContent = t.lblRegion;
  document.getElementById("desc-region").textContent = t.descRegion;
  document.getElementById("lbl-whole").textContent = t.lblWhole;
  document.getElementById("desc-whole").textContent = t.descWhole;
  document.getElementById("lbl-toggle").textContent = t.lblToggle;
  document.getElementById("desc-toggle").textContent = t.descToggle;
  document.getElementById("sec-general").textContent = t.secGeneral;
  document.getElementById("lbl-data-dir").textContent = t.lblDataDir;
  document.getElementById("desc-data-dir").textContent = t.descDataDir;
  document.getElementById("btn-browse-dir").textContent = t.btnBrowseDir;
  document.getElementById("lbl-clipboard").textContent = t.lblClipboard;
  document.getElementById("desc-clipboard").textContent = t.descClipboard;
  document.getElementById("lbl-hover").textContent = t.lblHover;
  document.getElementById("desc-hover").textContent = t.descHover;
  document.getElementById("lbl-reveal-new").textContent = t.lblRevealNew;
  document.getElementById("desc-reveal-new").textContent = t.descRevealNew;
  document.getElementById("lbl-sounds").textContent = t.lblSounds;
  document.getElementById("desc-sounds").textContent = t.descSounds;
  document.getElementById("lbl-sound-path").textContent = t.lblSoundPath;
  document.getElementById("desc-sound-path").textContent = t.descSoundPath;
  document.getElementById("btn-browse-sound").textContent = t.btnBrowseSound;
  document.getElementById("btn-test-sound").textContent = t.btnTestSound;
  document.getElementById("input-sound-path").placeholder = t.defaultSoundPlaceholder || "系统默认音效";
  document.getElementById("lbl-autostart").textContent = t.lblAutostart;
  document.getElementById("desc-autostart").textContent = t.descAutostart;
  document.getElementById("sec-display").textContent = t.secDisplay;
  document.getElementById("lbl-scale").textContent = t.lblScale;
  document.getElementById("desc-scale").textContent = t.descScale;
  document.getElementById("opt-scale-sm").textContent = t.optScaleSm;
  document.getElementById("opt-scale-md").textContent = t.optScaleMd;
  document.getElementById("opt-scale-lg").textContent = t.optScaleLg;
  document.getElementById("lbl-keep").textContent = t.lblKeep;
  document.getElementById("desc-keep").textContent = t.descKeep;
  document.getElementById("opt-keep-fit").textContent = t.optKeepFit;
  document.getElementById("lbl-lang").textContent = t.lblLang;
  document.getElementById("desc-lang").textContent = t.descLang;
  document.getElementById("btn-open-file").textContent = t.btnOpenFile;
  document.getElementById("btn-reset").textContent = t.btnReset;
  document.getElementById("btn-save").textContent = t.btnSave;

  // Refresh directory path label
  const inputDir = document.getElementById("input-data-dir");
  if (customDataDir) {
    inputDir.value = customDataDir;
  } else if (defaultDataDir) {
    inputDir.value = defaultDataDir + ` ${t.defaultDirNote || "(默认)"}`;
  }
}

/** Convert a Tauri accelerator string (e.g. "control+alt+KeyH") into HTML kbd elements */
function formatKbdHtml(accelerator) {
  if (!accelerator) return "<em>None</em>";
  const parts = accelerator.split("+");
  return parts
    .map((p) => {
      let label = p;
      const lower = p.toLowerCase();
      if (lower === "control" || lower === "ctrl") label = "Ctrl";
      else if (lower === "alt") label = "Alt";
      else if (lower === "shift") label = "Shift";
      else if (lower === "super" || lower === "meta") label = "Win";
      else if (p.startsWith("Key")) label = p.substring(3).toUpperCase();
      else if (p.startsWith("Digit")) label = p.substring(5);
      else label = p.toUpperCase();
      return `<kbd>${label}</kbd>`;
    })
    .join(" + ");
}

/** Render current hotkeys into the boxes */
function renderHotkeys() {
  document.getElementById("keys-region").innerHTML = formatKbdHtml(hotkeys.region);
  document.getElementById("keys-whole").innerHTML = formatKbdHtml(hotkeys.whole);
  document.getElementById("keys-toggle").innerHTML = formatKbdHtml(hotkeys.toggle);
}

/** Setup hotkey box listeners */
function setupRecorder(target) {
  const box = document.getElementById(`box-${target}`);
  const keysEl = document.getElementById(`keys-${target}`);

  box.addEventListener("click", () => {
    recordingTarget = target;
    box.classList.add("recording");
    const lang = document.getElementById("sel-lang").value;
    keysEl.innerHTML = `<em>${I18N[lang]?.pressKey || "Press keys…"}</em>`;
  });

  box.addEventListener("blur", () => {
    if (recordingTarget === target) {
      recordingTarget = null;
      box.classList.remove("recording");
      renderHotkeys();
    }
  });

  document.getElementById(`clear-${target}`).addEventListener("click", (e) => {
    e.stopPropagation();
    const def =
      target === "region"
        ? "control+alt+KeyH"
        : target === "whole"
          ? "control+alt+shift+KeyH"
          : "control+alt+KeyL";
    hotkeys[target] = def;
    renderHotkeys();
  });
}

window.addEventListener("keydown", async (e) => {
  if (!recordingTarget) return;

  // Escape cancels recording
  if (e.key === "Escape") {
    e.preventDefault();
    const box = document.getElementById(`box-${recordingTarget}`);
    box.classList.remove("recording");
    box.blur();
    recordingTarget = null;
    renderHotkeys();
    return;
  }

  // Modifiers alone don't finish a shortcut, but give preview
  const isModifier = ["Control", "Alt", "Shift", "Meta"].includes(e.key);
  if (isModifier) {
    e.preventDefault();
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Win");
    document.getElementById(`keys-${recordingTarget}`).innerHTML = parts.map((p) => `<kbd>${p}</kbd>`).join(" + ") + " + …";
    return;
  }

  // Non-modifier pressed with modifiers
  if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
    const lang = document.getElementById("sel-lang").value;
    const box = document.getElementById(`box-${recordingTarget}`);
    const keysEl = document.getElementById(`keys-${recordingTarget}`);
    keysEl.innerHTML = `<span style="color:#ef4444;font-size:12px;">${I18N[lang]?.needModifier || "Need modifier"}</span>`;
    setTimeout(() => {
      if (recordingTarget) {
        keysEl.innerHTML = `<em>${I18N[lang]?.pressKey || "Press keys…"}</em>`;
      }
    }, 1200);
    return;
  }

  e.preventDefault();
  const parts = [];
  if (e.ctrlKey) parts.push("control");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("super");

  let code = e.code;
  // standard key mapping for Tauri global-shortcut
  if (code.startsWith("Key") || code.startsWith("Digit")) {
    parts.push(code);
  } else if (/^F\d{1,2}$/.test(code)) {
    parts.push(code);
  } else {
    parts.push(code);
  }

  const accelerator = parts.join("+");
  hotkeys[recordingTarget] = accelerator;

  const target = recordingTarget;
  const box = document.getElementById(`box-${target}`);
  box.classList.remove("recording");
  box.blur();
  recordingTarget = null;

  renderHotkeys();
});

// Drag window from custom titlebar
document.getElementById("titlebar").addEventListener("mousedown", (e) => {
  if (e.target.closest("button") || e.button !== 0) return;
  invoke("drag_window").catch(console.error);
});

async function load() {
  currentSettings = await invoke("get_settings");
  if (!currentSettings) return;

  defaultDataDir = await invoke("get_default_data_dir");
  customDataDir = currentSettings.data_dir;

  hotkeys.region = currentSettings.region;
  hotkeys.whole = currentSettings.whole;
  hotkeys.toggle = currentSettings.toggle || "control+alt+KeyL";
  renderHotkeys();

  document.getElementById("chk-clipboard").checked = currentSettings.hang_clipboard;
  document.getElementById("chk-hover").checked = currentSettings.reveal_on_hover;
  document.getElementById("chk-reveal-new").checked = currentSettings.reveal_on_new;
  document.getElementById("chk-sounds").checked = currentSettings.sounds;
  document.getElementById("chk-autostart").checked = currentSettings.open_at_login;

  customSoundPath = currentSettings.custom_sound_path;
  const soundInput = document.getElementById("input-sound-path");
  if (customSoundPath) {
    soundInput.value = customSoundPath;
    soundInput.title = customSoundPath;
  } else {
    soundInput.value = "";
    soundInput.title = "";
  }
  document.getElementById("row-custom-sound").classList.toggle("disabled", !currentSettings.sounds);

  document.getElementById("sel-scale").value = String(currentSettings.scale);
  document.getElementById("sel-keep").value = currentSettings.keep_on_line !== null ? String(currentSettings.keep_on_line) : "";
  document.getElementById("sel-lang").value = currentSettings.language || "zh-CN";

  updateLanguage(document.getElementById("sel-lang").value);
}

document.getElementById("btn-browse-dir").addEventListener("click", async () => {
  try {
    const selected = await invoke("select_data_dir");
    if (selected) {
      customDataDir = selected;
      document.getElementById("input-data-dir").value = selected;
      document.getElementById("input-data-dir").title = selected;
    }
  } catch (err) {
    console.error("Failed to select directory:", err);
  }
});

document.getElementById("btn-reset-dir").addEventListener("click", () => {
  customDataDir = null;
  const lang = document.getElementById("sel-lang").value;
  const defaultTag = ` ${I18N[lang]?.defaultDirNote || "(默认)"}`;
  document.getElementById("input-data-dir").value = defaultDataDir + defaultTag;
  document.getElementById("input-data-dir").title = defaultDataDir;
});

document.getElementById("chk-sounds").addEventListener("change", (e) => {
  document.getElementById("row-custom-sound").classList.toggle("disabled", !e.target.checked);
});

document.getElementById("btn-browse-sound").addEventListener("click", async () => {
  try {
    const selected = await invoke("select_sound_file");
    if (selected) {
      customSoundPath = selected;
      const soundInput = document.getElementById("input-sound-path");
      soundInput.value = selected;
      soundInput.title = selected;
    }
  } catch (err) {
    console.error("Failed to select sound file:", err);
  }
});

document.getElementById("btn-test-sound").addEventListener("click", async () => {
  try {
    await invoke("play_test_sound", { path: customSoundPath || null });
  } catch (err) {
    console.error("Failed to play test sound:", err);
  }
});

document.getElementById("btn-reset-sound").addEventListener("click", () => {
  customSoundPath = null;
  const soundInput = document.getElementById("input-sound-path");
  soundInput.value = "";
  soundInput.title = "";
});

document.getElementById("sel-lang").addEventListener("change", (e) => {
  updateLanguage(e.target.value);
});

document.getElementById("btn-close").addEventListener("click", async () => {
  await invoke("close_settings_window");
});

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape" && !recordingTarget) {
    await invoke("close_settings_window");
  }
});

document.getElementById("btn-open-file").addEventListener("click", async () => {
  await invoke("open_settings_file");
});

document.getElementById("btn-reset").addEventListener("click", () => {
  hotkeys.region = "control+alt+KeyH";
  hotkeys.whole = "control+alt+shift+KeyH";
  hotkeys.toggle = "control+alt+KeyL";
  renderHotkeys();
  customDataDir = null;
  const defaultTag = ` ${I18N["zh-CN"]?.defaultDirNote || "(默认)"}`;
  document.getElementById("input-data-dir").value = defaultDataDir + defaultTag;
  document.getElementById("input-data-dir").title = defaultDataDir;
  document.getElementById("chk-clipboard").checked = true;
  document.getElementById("chk-hover").checked = false;
  document.getElementById("chk-reveal-new").checked = true;
  document.getElementById("chk-sounds").checked = false;
  document.getElementById("chk-autostart").checked = false;
  customSoundPath = null;
  const soundInput = document.getElementById("input-sound-path");
  soundInput.value = "";
  soundInput.title = "";
  document.getElementById("row-custom-sound").classList.add("disabled");
  document.getElementById("sel-scale").value = "1.0";
  document.getElementById("sel-keep").value = "";
  document.getElementById("sel-lang").value = "zh-CN";
  updateLanguage("zh-CN");
});

document.getElementById("btn-save").addEventListener("click", async () => {
  const keepVal = document.getElementById("sel-keep").value;
  const lang = document.getElementById("sel-lang").value;
  const btn = document.getElementById("btn-save");
  const oldText = btn.textContent;

  btn.textContent = I18N[lang]?.saving || "Saving…";
  btn.disabled = true;

  const newSettings = {
    ...currentSettings,
    region: hotkeys.region,
    whole: hotkeys.whole,
    toggle: hotkeys.toggle,
    data_dir: customDataDir !== undefined ? customDataDir : currentSettings.data_dir,
    hang_clipboard: document.getElementById("chk-clipboard").checked,
    reveal_on_hover: document.getElementById("chk-hover").checked,
    reveal_on_new: document.getElementById("chk-reveal-new").checked,
    sounds: document.getElementById("chk-sounds").checked,
    custom_sound_path: customSoundPath !== undefined ? customSoundPath : currentSettings.custom_sound_path,
    open_at_login: document.getElementById("chk-autostart").checked,
    scale: parseFloat(document.getElementById("sel-scale").value) || 1.0,
    keep_on_line: keepVal ? parseInt(keepVal, 10) : null,
    language: lang,
  };

  try {
    await invoke("save_settings", { newSettings });
    currentSettings = newSettings;
    customDataDir = newSettings.data_dir;
    customSoundPath = newSettings.custom_sound_path;
    btn.textContent = I18N[lang]?.saved || "Saved!";
    btn.style.backgroundColor = "#10b981";
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.backgroundColor = "";
      btn.disabled = false;
    }, 1200);
  } catch (err) {
    btn.textContent = oldText;
    btn.disabled = false;
    alert("Save failed: " + err);
  }
});

setupRecorder("region");
setupRecorder("whole");
setupRecorder("toggle");

load().catch(console.error);

listen("settings:refresh", () => void load());

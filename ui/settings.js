// Settings Window Frontend: Hotkey Recording, Conflict Checking, and Configuration

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let currentSettings = null;
let recordingTarget = null; // 'region' | 'whole' | null

// Raw accelerators currently held by the inputs
let hotkeys = {
  region: "control+alt+KeyH",
  whole: "control+alt+shift+KeyH",
};

const I18N = {
  "zh-CN": {
    title: "偏好设置",
    secShortcuts: "快捷键配置",
    shortcutsTip: "点击输入框后直接按下组合键（如 Ctrl + Alt + A）。系统将自动检测冲突。",
    lblRegion: "区域截图",
    descRegion: "拖选矩形区域进行截图",
    lblWhole: "全屏截图",
    descWhole: "瞬间截取整个屏幕画面",
    secGeneral: "常规选项",
    lblClipboard: "自动挂载剪贴板图片",
    descClipboard: "复制图片（包含第三方截图）时自动挂上晾衣绳",
    lblHover: "鼠标悬停展开",
    descHover: "移至屏幕顶部中央 3px 热区触发下垂",
    lblRevealNew: "新图自动展开与展示",
    descRevealNew: "截图或复制新图片后自动展开绳索并展示 3 秒",
    lblSounds: "提示音效",
    descSounds: "新图片挂上晾衣绳时播放提示音",
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
    pressKey: "请按下按键…",
    validMsg: "✓ 快捷键有效且可用",
    needModifier: "需包含 Ctrl / Alt / Shift 之一",
  },
  en: {
    title: "Preferences",
    secShortcuts: "Shortcuts",
    shortcutsTip: "Click a box then press keys (e.g. Ctrl + Alt + A). Conflicts are automatically tested.",
    lblRegion: "Region Capture",
    descRegion: "Drag a rectangle to capture a portion of the screen",
    lblWhole: "Full Screen Capture",
    descWhole: "Capture the entire active screen immediately",
    secGeneral: "General",
    lblClipboard: "Hang copied images",
    descClipboard: "Automatically hang copied images (including 3rd-party tools) onto the line",
    lblHover: "Reveal on hover",
    descHover: "Drop line when hovering at top edge middle 3px band",
    lblRevealNew: "Reveal on new photo",
    descRevealNew: "Auto-drop line and display newly hung photo for 3s",
    lblSounds: "Sound effects",
    descSounds: "Play subtle chime when a photo hangs on the line",
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
    pressKey: "Press keys…",
    validMsg: "✓ Available and valid",
    needModifier: "Must include Ctrl, Alt, or Shift",
  },
};

function updateLanguage(lang) {
  const t = I18N[lang] || I18N["zh-CN"];
  document.getElementById("title-text").textContent = t.title;
  document.getElementById("sec-shortcuts").textContent = t.secShortcuts;
  document.getElementById("shortcuts-tip").textContent = t.shortcutsTip;
  document.getElementById("lbl-region").textContent = t.lblRegion;
  document.getElementById("desc-region").textContent = t.descRegion;
  document.getElementById("lbl-whole").textContent = t.lblWhole;
  document.getElementById("desc-whole").textContent = t.descWhole;
  document.getElementById("sec-general").textContent = t.secGeneral;
  document.getElementById("lbl-clipboard").textContent = t.lblClipboard;
  document.getElementById("desc-clipboard").textContent = t.descClipboard;
  document.getElementById("lbl-hover").textContent = t.lblHover;
  document.getElementById("desc-hover").textContent = t.descHover;
  document.getElementById("lbl-reveal-new").textContent = t.lblRevealNew;
  document.getElementById("desc-reveal-new").textContent = t.descRevealNew;
  document.getElementById("lbl-sounds").textContent = t.lblSounds;
  document.getElementById("desc-sounds").textContent = t.descSounds;
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
}

/** Check shortcut validity & conflict with Rust */
async function testShortcut(target, accelerator) {
  const statusEl = document.getElementById(`status-${target}`);
  if (!accelerator) {
    statusEl.textContent = "";
    statusEl.className = "status-msg";
    return;
  }
  try {
    const res = await invoke("check_shortcut", { accelerator });
    const lang = document.getElementById("sel-lang").value;
    const t = I18N[lang] || I18N["zh-CN"];
    if (res.valid) {
      statusEl.textContent = t.validMsg;
      statusEl.className = "status-msg ok";
    } else {
      statusEl.textContent = res.error || "Conflict";
      statusEl.className = "status-msg error";
    }
  } catch (err) {
    statusEl.textContent = String(err);
    statusEl.className = "status-msg error";
  }
}

/** Setup hotkey box listeners */
function setupRecorder(target) {
  const box = document.getElementById(`box-${target}`);
  const keysEl = document.getElementById(`keys-${target}`);
  const statusEl = document.getElementById(`status-${target}`);

  box.addEventListener("click", () => {
    recordingTarget = target;
    box.classList.add("recording");
    const lang = document.getElementById("sel-lang").value;
    keysEl.innerHTML = `<em>${I18N[lang]?.pressKey || "Press keys…"}</em>`;
    statusEl.textContent = "";
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
    const def = target === "region" ? "control+alt+KeyH" : "control+alt+shift+KeyH";
    hotkeys[target] = def;
    renderHotkeys();
    void testShortcut(target, def);
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
    const statusEl = document.getElementById(`status-${recordingTarget}`);
    statusEl.textContent = I18N[lang]?.needModifier || "Need modifier";
    statusEl.className = "status-msg error";
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
  await testShortcut(target, accelerator);
});

async function load() {
  currentSettings = await invoke("get_settings");
  if (!currentSettings) return;

  hotkeys.region = currentSettings.region;
  hotkeys.whole = currentSettings.whole;
  renderHotkeys();

  document.getElementById("chk-clipboard").checked = currentSettings.hang_clipboard;
  document.getElementById("chk-hover").checked = currentSettings.reveal_on_hover;
  document.getElementById("chk-reveal-new").checked = currentSettings.reveal_on_new;
  document.getElementById("chk-sounds").checked = currentSettings.sounds;
  document.getElementById("chk-autostart").checked = currentSettings.open_at_login;

  document.getElementById("sel-scale").value = String(currentSettings.scale);
  document.getElementById("sel-keep").value = currentSettings.keep_on_line !== null ? String(currentSettings.keep_on_line) : "";
  document.getElementById("sel-lang").value = currentSettings.language || "zh-CN";

  updateLanguage(document.getElementById("sel-lang").value);

  void testShortcut("region", hotkeys.region);
  void testShortcut("whole", hotkeys.whole);
}

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
  renderHotkeys();
  document.getElementById("chk-clipboard").checked = true;
  document.getElementById("chk-hover").checked = true;
  document.getElementById("chk-reveal-new").checked = true;
  document.getElementById("chk-sounds").checked = false;
  document.getElementById("chk-autostart").checked = false;
  document.getElementById("sel-scale").value = "1.0";
  document.getElementById("sel-keep").value = "";
  document.getElementById("sel-lang").value = "zh-CN";
  updateLanguage("zh-CN");
  void testShortcut("region", hotkeys.region);
  void testShortcut("whole", hotkeys.whole);
});

document.getElementById("btn-save").addEventListener("click", async () => {
  const keepVal = document.getElementById("sel-keep").value;
  const newSettings = {
    ...currentSettings,
    region: hotkeys.region,
    whole: hotkeys.whole,
    hang_clipboard: document.getElementById("chk-clipboard").checked,
    reveal_on_hover: document.getElementById("chk-hover").checked,
    reveal_on_new: document.getElementById("chk-reveal-new").checked,
    sounds: document.getElementById("chk-sounds").checked,
    open_at_login: document.getElementById("chk-autostart").checked,
    scale: parseFloat(document.getElementById("sel-scale").value) || 1.0,
    keep_on_line: keepVal ? parseInt(keepVal, 10) : null,
    language: document.getElementById("sel-lang").value,
  };

  try {
    await invoke("save_settings", { newSettings });
    currentSettings = newSettings;
    const btn = document.getElementById("btn-save");
    const lang = newSettings.language;
    const oldText = btn.textContent;
    btn.textContent = I18N[lang]?.saved || "Saved!";
    btn.style.backgroundColor = "#10b981";
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.backgroundColor = "";
    }, 1200);
  } catch (err) {
    alert("Save failed: " + err);
  }
});

setupRecorder("region");
setupRecorder("whole");

load().catch(console.error);

listen("settings:refresh", () => void load());

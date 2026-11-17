// OCR Text Recognition Result Window Frontend

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let currentLang = "zh-CN";
let toastTimer = null;

const I18N = {
  "zh-CN": {
    title: "文字提取",
    badgeOcr: "OCR",
    titleOcr: "提取的文字内容",
    charCount: (n) => `共 ${n} 字`,
    editorDesc: "您可以在下方直接编辑、修改或追加内容：",
    placeholder: "在此编辑文字...",
    lblCopyText: "复制文字到剪贴板",
    lblClearText: "清空",
    emptyText: "未在此图片中识别到任何文字",
    escHint: "Esc 退出",
    lblClose: "关闭",
    toastCopied: "✓ 已复制到剪贴板",
    toastCleared: "已清空文本",
  },
  en: {
    title: "Text Extraction",
    badgeOcr: "OCR",
    titleOcr: "Extracted Text",
    charCount: (n) => `${n} chars`,
    editorDesc: "You can edit, modify, or append text directly below:",
    placeholder: "Edit text here...",
    lblCopyText: "Copy Text to Clipboard",
    lblClearText: "Clear",
    emptyText: "No text detected in this image",
    escHint: "Esc to exit",
    lblClose: "Close",
    toastCopied: "✓ Copied to clipboard",
    toastCleared: "Text cleared",
  },
};

function updateLanguage(lang) {
  currentLang = lang;
  const t = I18N[lang] || I18N["zh-CN"];
  document.getElementById("title-text").textContent = t.title;
  document.getElementById("badge-ocr").textContent = t.badgeOcr;
  document.getElementById("title-ocr").textContent = t.titleOcr;
  document.getElementById("editor-desc").textContent = t.editorDesc;
  document.getElementById("ocr-editor").placeholder = t.placeholder;
  document.getElementById("lbl-copy-text").textContent = t.lblCopyText;
  document.getElementById("lbl-clear-text").textContent = t.lblClearText;
  document.getElementById("empty-text").textContent = t.emptyText;
  document.getElementById("esc-hint").textContent = t.escHint;
  document.getElementById("lbl-close").textContent = t.lblClose;

  updateCharCount();
}

function updateCharCount() {
  const t = I18N[currentLang] || I18N["zh-CN"];
  const editor = document.getElementById("ocr-editor");
  const count = editor ? editor.value.length : 0;
  document.getElementById("char-stat").textContent = t.charCount(count);
}

function showToast(text) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 1600);
}

async function copyToClipboard(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const t = I18N[currentLang] || I18N["zh-CN"];
  showToast(t.toastCopied);
}

function render(result) {
  const sectionOcr = document.getElementById("section-ocr");
  const sectionEmpty = document.getElementById("section-empty");
  const ocrEditor = document.getElementById("ocr-editor");

  const hasText = result && result.text && result.text.trim().length > 0;

  if (hasText) {
    sectionOcr.classList.remove("hidden");
    sectionEmpty.classList.add("hidden");
    ocrEditor.value = result.text;
    updateCharCount();
  } else {
    sectionOcr.classList.add("hidden");
    sectionEmpty.classList.remove("hidden");
    ocrEditor.value = "";
    updateCharCount();
  }
}

// Event handlers
document.getElementById("btn-close-title").addEventListener("click", async () => {
  await invoke("close_ocr_window");
});

document.getElementById("btn-close-footer").addEventListener("click", async () => {
  await invoke("close_ocr_window");
});

document.getElementById("ocr-editor").addEventListener("input", () => {
  updateCharCount();
});

document.getElementById("btn-copy-text").addEventListener("click", async () => {
  const editor = document.getElementById("ocr-editor");
  if (editor) {
    await copyToClipboard(editor.value);
  }
});

document.getElementById("btn-clear-text").addEventListener("click", () => {
  const editor = document.getElementById("ocr-editor");
  if (editor) {
    editor.value = "";
    updateCharCount();
    const t = I18N[currentLang] || I18N["zh-CN"];
    showToast(t.toastCleared);
  }
});

// Keydown: Esc to close
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    await invoke("close_ocr_window");
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

  await listen("ocr:display", (event) => {
    render(event.payload);
  });
}

boot().catch((err) => console.error("hangboard: ocr boot failed", err));

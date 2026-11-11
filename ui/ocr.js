// OCR & QR Recognition Result Window Frontend

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let currentLang = "zh-CN";
let currentResult = null;
let toastTimer = null;
let pendingOpenUrl = null;

const I18N = {
  "zh-CN": {
    title: "识别结果",
    badgeQr: "二维码",
    titleQr: "识别到二维码",
    warnText: "安全提示：打开外部未知链接可能存在风险，请核实后再访问。",
    lblOpenUrl: "打开链接 (需确认)",
    lblCopyUrl: "复制链接",
    lblCopyQrText: "复制内容",
    badgeOcr: "文字",
    titleOcr: "提取的文字内容",
    charCount: (n) => `共 ${n} 字`,
    editorDesc: "您可以在下方直接编辑、修改或追加内容：",
    placeholder: "在此编辑文字...",
    lblCopyText: "复制编辑后的文字",
    lblClearText: "清空",
    emptyText: "未在此图片中识别到任何文字或二维码",
    escHint: "Esc 退出",
    lblClose: "关闭",
    modalTitle: "安全确认",
    modalDesc: "即将使用系统默认浏览器打开以下链接：",
    modalCaution: "请确认此链接来自可信任来源，谨防恶意网站。",
    lblConfirmOpen: "确认打开",
    lblConfirmCancel: "取消",
    toastCopied: "✓ 已复制到剪贴板",
    toastCleared: "已清空文本",
  },
  en: {
    title: "Recognition Result",
    badgeQr: "QR Code",
    titleQr: "QR Code Detected",
    warnText: "Security Note: Opening unknown external links carries risk. Please verify.",
    lblOpenUrl: "Open Link (Confirm)",
    lblCopyUrl: "Copy Link",
    lblCopyQrText: "Copy Content",
    badgeOcr: "Text",
    titleOcr: "Extracted Text",
    charCount: (n) => `${n} chars`,
    editorDesc: "You can edit, modify, or append text directly below:",
    placeholder: "Edit text here...",
    lblCopyText: "Copy Edited Text",
    lblClearText: "Clear",
    emptyText: "No text or QR code detected in this image",
    escHint: "Esc to exit",
    lblClose: "Close",
    modalTitle: "Security Confirmation",
    modalDesc: "About to open the following URL in your default browser:",
    modalCaution: "Please ensure this link is from a trusted source.",
    lblConfirmOpen: "Confirm & Open",
    lblConfirmCancel: "Cancel",
    toastCopied: "✓ Copied to clipboard",
    toastCleared: "Text cleared",
  },
};

function updateLanguage(lang) {
  currentLang = lang;
  const t = I18N[lang] || I18N["zh-CN"];
  document.getElementById("title-text").textContent = t.title;
  document.getElementById("badge-qr").textContent = t.badgeQr;
  document.getElementById("title-qr").textContent = t.titleQr;
  document.getElementById("warn-text").textContent = t.warnText;
  document.getElementById("lbl-open-url").textContent = t.lblOpenUrl;
  document.getElementById("lbl-copy-url").textContent = t.lblCopyUrl;
  document.getElementById("lbl-copy-qr-text").textContent = t.lblCopyQrText;
  document.getElementById("badge-ocr").textContent = t.badgeOcr;
  document.getElementById("title-ocr").textContent = t.titleOcr;
  document.getElementById("editor-desc").textContent = t.editorDesc;
  document.getElementById("ocr-editor").placeholder = t.placeholder;
  document.getElementById("lbl-copy-text").textContent = t.lblCopyText;
  document.getElementById("lbl-clear-text").textContent = t.lblClearText;
  document.getElementById("empty-text").textContent = t.emptyText;
  document.getElementById("esc-hint").textContent = t.escHint;
  document.getElementById("lbl-close").textContent = t.lblClose;
  document.getElementById("modal-title").textContent = t.modalTitle;
  document.getElementById("modal-desc").textContent = t.modalDesc;
  document.getElementById("modal-caution").textContent = t.modalCaution;
  document.getElementById("lbl-confirm-open").textContent = t.lblConfirmOpen;
  document.getElementById("lbl-confirm-cancel").textContent = t.lblConfirmCancel;

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
    // Fallback via document.execCommand
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

function showConfirmationModal(url) {
  pendingOpenUrl = url;
  document.getElementById("modal-target-url").textContent = url;
  document.getElementById("confirm-modal").classList.remove("hidden");
}

function hideConfirmationModal() {
  pendingOpenUrl = null;
  document.getElementById("confirm-modal").classList.add("hidden");
}

function render(result) {
  currentResult = result;
  const sectionQr = document.getElementById("section-qr");
  const sectionOcr = document.getElementById("section-ocr");
  const sectionEmpty = document.getElementById("section-empty");
  const qrUrlBox = document.getElementById("qr-url-box");
  const qrTextBox = document.getElementById("qr-text-box");
  const ocrEditor = document.getElementById("ocr-editor");

  const hasQr = result && result.has_qr && result.qr_codes && result.qr_codes.length > 0;
  const hasText = result && result.text && result.text.trim().length > 0;

  // QR Code section
  if (hasQr) {
    sectionQr.classList.remove("hidden");
    const qrContent = result.qr_codes[0];
    const isUrl = qrContent.startsWith("http://") || qrContent.startsWith("https://");

    if (isUrl) {
      qrUrlBox.classList.remove("hidden");
      qrTextBox.classList.add("hidden");
      document.getElementById("url-text").textContent = qrContent;
    } else {
      qrUrlBox.classList.add("hidden");
      qrTextBox.classList.remove("hidden");
      document.getElementById("qr-plain-text").textContent = qrContent;
    }
  } else {
    sectionQr.classList.add("hidden");
  }

  // Text OCR section
  if (hasText) {
    sectionOcr.classList.remove("hidden");
    ocrEditor.value = result.text;
    updateCharCount();
  } else {
    sectionOcr.classList.add("hidden");
    ocrEditor.value = "";
    updateCharCount();
  }

  // Empty state
  if (!hasQr && !hasText) {
    sectionEmpty.classList.remove("hidden");
  } else {
    sectionEmpty.classList.add("hidden");
  }
}

// Event handlers
document.getElementById("btn-close-title").addEventListener("click", async () => {
  await invoke("close_ocr_window");
});

document.getElementById("btn-close-footer").addEventListener("click", async () => {
  await invoke("close_ocr_window");
});

document.getElementById("btn-open-url").addEventListener("click", () => {
  if (currentResult && currentResult.qr_codes && currentResult.qr_codes[0]) {
    showConfirmationModal(currentResult.qr_codes[0]);
  }
});

document.getElementById("btn-copy-url").addEventListener("click", async () => {
  if (currentResult && currentResult.qr_codes && currentResult.qr_codes[0]) {
    await copyToClipboard(currentResult.qr_codes[0]);
  }
});

document.getElementById("btn-copy-qr-text").addEventListener("click", async () => {
  if (currentResult && currentResult.qr_codes && currentResult.qr_codes[0]) {
    await copyToClipboard(currentResult.qr_codes[0]);
  }
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

// Modal events
document.getElementById("btn-confirm-cancel").addEventListener("click", () => {
  hideConfirmationModal();
});

document.getElementById("btn-confirm-open").addEventListener("click", async () => {
  if (pendingOpenUrl) {
    const url = pendingOpenUrl;
    hideConfirmationModal();
    try {
      await invoke("open_url", { url });
    } catch (err) {
      alert(`无法打开链接: ${err}`);
    }
  }
});

// Keydown: Esc
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("confirm-modal");
    if (!modal.classList.contains("hidden")) {
      hideConfirmationModal();
    } else {
      await invoke("close_ocr_window");
    }
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

// The preview lightbox front end.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const container = document.getElementById("container");
const photo = document.getElementById("photo");
const info = document.getElementById("info");
const counter = document.getElementById("counter");
const btnClose = document.getElementById("btn-close");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnOcr = document.getElementById("btn-ocr");
const btnCopy = document.getElementById("btn-copy");
const btnOpen = document.getElementById("btn-open");
const ocrLabel = document.getElementById("ocr-label");
const copyLabel = document.getElementById("copy-label");
const openLabel = document.getElementById("open-label");
const hintKey = document.getElementById("hint-key");
const toast = document.getElementById("toast");

let currentLang = "zh-CN";
let currentItemId = null;
let toastTimer = null;

function showToast(text, isLink = false, onLinkClick = null) {
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.remove("hidden", "link-toast");
  if (isLink && onLinkClick) {
    toast.classList.add("link-toast");
    toast.onclick = onLinkClick;
  } else {
    toast.onclick = null;
  }
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, isLink ? 4500 : 2500);
}

function updateLanguage(lang) {
  currentLang = lang;
  const isZh = lang === "zh-CN";
  if (ocrLabel) ocrLabel.textContent = isZh ? "提取文字" : "Extract";
  if (copyLabel) copyLabel.textContent = isZh ? "复制" : "Copy";
  if (openLabel) openLabel.textContent = isZh ? "打开" : "Open";
  if (hintKey) hintKey.textContent = isZh ? "Esc 退出 · ← → 切换" : "Esc to exit · ← → to step";
}

async function refresh() {
  const index = await invoke("preview_index");
  if (index === null || index === undefined) return;

  const url = await invoke("preview_image");
  const items = await invoke("list_items");

  const count = Array.isArray(items) ? items.length : 0;
  // items are ordered newest-first in Rust, but preview uses display order
  // (left to right = oldest to newest)
  const ordered = Array.isArray(items) ? [...items].reverse() : [];
  const item = ordered[index];
  currentItemId = item ? item.id : null;

  if (url) {
    photo.style.opacity = "0.7";
    photo.src = url;
  }

  if (toast) toast.classList.add("hidden");
  counter.textContent = count > 0 ? `${index + 1} / ${count}` : "";
}

photo.addEventListener("load", () => {
  photo.style.opacity = "1";
  if (photo.naturalWidth && photo.naturalHeight) {
    info.textContent = `${photo.naturalWidth} × ${photo.naturalHeight}`;
  } else {
    info.textContent = "";
  }
});

photo.draggable = true;
photo.addEventListener("dragstart", (e) => {
  e.preventDefault();
  if (currentItemId) {
    void invoke("start_card_drag", { id: currentItemId });
  }
});

async function step(delta) {
  await invoke("step_preview", { delta });
  await refresh();
}

async function close() {
  await invoke("close_preview");
}

btnClose.addEventListener("click", close);
btnPrev.addEventListener("click", () => void step(-1));
btnNext.addEventListener("click", () => void step(1));

btnOcr.addEventListener("click", async () => {
  if (!currentItemId) return;
  const isZh = currentLang === "zh-CN";
  btnOcr.classList.add("loading");
  ocrLabel.textContent = isZh ? "识别中..." : "Extracting...";
  try {
    const res = await invoke("recognize_image", { id: currentItemId });
    btnOcr.classList.remove("loading");
    ocrLabel.textContent = isZh ? "提取文字" : "Extract";

    if (res.has_qr) {
      if (res.is_url) {
        showToast(
          isZh
            ? `✓ 已识别二维码并复制链接 (点击打开)`
            : `✓ QR URL copied (Click to open)`,
          true,
          () => void invoke("open_url", { url: res.primary_text }),
        );
      } else {
        showToast(
          isZh ? `✓ 已识别二维码并复制内容` : `✓ QR text copied to clipboard`,
        );
      }
    } else if (res.text && res.text.trim()) {
      showToast(
        isZh
          ? `✓ 已提取文字并复制 (${res.text.trim().length}字)`
          : `✓ Text extracted and copied (${res.text.trim().length} chars)`,
      );
    } else {
      showToast(
        isZh ? "未识别到文字或二维码" : "No text or QR code detected",
      );
    }
  } catch (err) {
    btnOcr.classList.remove("loading");
    ocrLabel.textContent = isZh ? "提取文字" : "Extract";
    showToast(isZh ? `识别失败: ${err}` : `Recognition failed: ${err}`);
  }
});

btnCopy.addEventListener("click", async () => {
  if (!currentItemId) return;
  await invoke("copy_item", { id: currentItemId });
  btnCopy.classList.add("copied");
  const oldText = copyLabel.textContent;
  copyLabel.textContent = currentLang === "zh-CN" ? "已复制!" : "Copied!";
  setTimeout(() => {
    btnCopy.classList.remove("copied");
    copyLabel.textContent = oldText;
  }, 900);
});

btnOpen.addEventListener("click", async () => {
  if (!currentItemId) return;
  await invoke("context_open", { id: currentItemId });
});

// Clicking the photo area (outside the photo itself) closes preview
document.getElementById("photo-area").addEventListener("click", (e) => {
  if (e.target === e.currentTarget || e.target.id === "photo-box") {
    void close();
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

  await listen("preview:show", () => void refresh());
  await refresh();

  window.addEventListener("keydown", async (event) => {
    if (event.repeat) return;
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      await close();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      await step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      await step(1);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === " ") event.preventDefault();
  });
}

boot().catch((error) => console.error("hangboard: preview boot failed", error));

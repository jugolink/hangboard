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
const btnPin = document.getElementById("btn-pin");
const btnCopy = document.getElementById("btn-copy");
const btnOpen = document.getElementById("btn-open");
const pinLabel = document.getElementById("pin-label");
const copyLabel = document.getElementById("copy-label");
const openLabel = document.getElementById("open-label");
const hintKey = document.getElementById("hint-key");

let currentLang = "zh-CN";
let currentItemId = null;

function updateLanguage(lang) {
  currentLang = lang;
  const isZh = lang === "zh-CN";
  if (pinLabel) pinLabel.textContent = isZh ? "钉在桌面" : "Pin";
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

if (btnPin) {
  btnPin.addEventListener("click", async () => {
    if (!currentItemId) return;
    await invoke("pin_to_desktop", { id: currentItemId });
    await close();
  });
}

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

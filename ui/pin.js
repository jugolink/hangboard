// Pinned Floating Window Frontend: Zoom, Opacity, Drag, Copy, Always-on-top

const { invoke } = window.__TAURI__.core;

const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const card = document.getElementById("pin-card");
const img = document.getElementById("pin-img");
const scaleBadge = document.getElementById("scale-badge");
const btnOnTop = document.getElementById("btn-ontop");
const btnCopy = document.getElementById("btn-copy");
const btnClose = document.getElementById("btn-close");
const toast = document.getElementById("pin-toast");
const menu = document.getElementById("pin-menu");
const ontopCheck = document.getElementById("ontop-check");

let naturalWidth = 400;
let naturalHeight = 300;
let currentZoom = 1.0;
let currentOpacity = 1.0;
let isAlwaysOnTop = true;
let toastTimer = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1200);
}

async function init() {
  if (!id) return;
  try {
    const dataUrl = await invoke("get_pin_image", { id });
    img.src = dataUrl;

    img.onload = () => {
      naturalWidth = img.naturalWidth || 400;
      naturalHeight = img.naturalHeight || 300;
      // Calculate initial zoom based on current window size vs natural size
      currentZoom = window.innerWidth / naturalWidth;
      updateScaleBadge();
    };
  } catch (err) {
    console.error("Failed to load pin image:", err);
  }
}

function updateScaleBadge() {
  scaleBadge.textContent = `${Math.round(currentZoom * 100)}%`;
}

// Native window drag
card.addEventListener("mousedown", (e) => {
  hideMenu();
  if (e.target.closest("button") || e.target.closest("#pin-menu") || e.button !== 0) return;
  invoke("drag_window").catch(console.error);
});

// Wheel interaction: zoom / opacity
window.addEventListener(
  "wheel",
  async (e) => {
    e.preventDefault();

    if (e.ctrlKey) {
      // Adjust Opacity
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      currentOpacity = Math.max(0.18, Math.min(1.0, currentOpacity + delta));
      card.style.opacity = currentOpacity;
      showToast(`透明度: ${Math.round(currentOpacity * 100)}%`);
      return;
    }

    // Adjust Zoom
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.max(0.2, Math.min(3.5, currentZoom * factor));
    if (Math.abs(newZoom - currentZoom) < 0.005) return;

    currentZoom = newZoom;
    updateScaleBadge();

    const targetW = Math.round(naturalWidth * currentZoom);
    const targetH = Math.round(naturalHeight * currentZoom);

    await invoke("resize_pinned_window", {
      width: targetW,
      height: targetH,
    });
  },
  { passive: false }
);

// Reset scale to 100%
async function resetScale() {
  currentZoom = 1.0;
  updateScaleBadge();
  await invoke("resize_pinned_window", {
    width: naturalWidth,
    height: naturalHeight,
  });
  showToast("还原 100%");
}

scaleBadge.addEventListener("click", resetScale);

// Copy image
async function copyImage() {
  if (!id) return;
  await invoke("copy_item", { id });
  showToast("✓ 已复制到剪贴板");
}

btnCopy.addEventListener("click", copyImage);

// Close pin
async function closePin() {
  if (!id) return;
  await invoke("close_pin", { id });
}

btnClose.addEventListener("click", closePin);

// Double-click to close
card.addEventListener("dblclick", (e) => {
  if (e.target.closest("button") || e.target.closest("#pin-menu")) return;
  void closePin();
});

// Toggle Always-on-top
async function toggleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  await invoke("set_pin_always_on_top", { onTop: isAlwaysOnTop });
  btnOnTop.classList.toggle("active", isAlwaysOnTop);
  ontopCheck.style.visibility = isAlwaysOnTop ? "visible" : "hidden";
  showToast(isAlwaysOnTop ? "已置顶" : "取消置顶");
}

btnOnTop.addEventListener("click", toggleAlwaysOnTop);

// Context Menu
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 160)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 150)}px`;
  menu.classList.remove("hidden");
});

function hideMenu() {
  menu.classList.add("hidden");
}

window.addEventListener("click", hideMenu);

document.getElementById("menu-copy").addEventListener("click", copyImage);
document.getElementById("menu-reset").addEventListener("click", resetScale);
document.getElementById("menu-ontop").addEventListener("click", toggleAlwaysOnTop);
document.getElementById("menu-close").addEventListener("click", closePin);

// Keyboard shortcuts
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    await closePin();
  } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    await copyImage();
  } else if (e.key === "1" || e.key === "0") {
    await resetScale();
  }
});

init().catch(console.error);

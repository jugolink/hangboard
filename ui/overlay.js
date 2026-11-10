// The region-picking overlay.
//
// Flow: Rust freezes the screen and sends the still as a data URL, along with
// the physical-to-logical factor. The user drags a rectangle here, in CSS
// pixels. Rust multiplies by the factor and cuts from the lossless frozen
// frame -- so this file never touches pixels, only coordinates.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const backdrop = document.getElementById("backdrop");
const dimmer = document.getElementById("dimmer");
const selection = document.getElementById("selection");
const sizeLabel = document.getElementById("size");
const hint = document.getElementById("hint");

let factor = 1;

/** The rectangle being picked, in CSS pixels. */
let box = null;
/** The drag in progress, if any. */
let drag = null;

function clampToViewport(r) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let { x, y, w: rw, h: rh } = r;
  x = Math.max(0, Math.min(x, w));
  y = Math.max(0, Math.min(y, h));
  rw = Math.max(0, Math.min(rw, w - x));
  rh = Math.max(0, Math.min(rh, h - y));
  return { x, y, w: rw, h: rh };
}

function paint() {
  if (!box || box.w < 1 || box.h < 1) {
    selection.hidden = true;
    dimmer.style.display = "";
    sizeLabel.textContent = "";
    return;
  }
  selection.hidden = false;
  dimmer.style.display = "none";
  selection.style.left = `${box.x}px`;
  selection.style.top = `${box.y}px`;
  selection.style.width = `${box.w}px`;
  selection.style.height = `${box.h}px`;

  // Report physical pixels, since that is what actually gets saved.
  const pw = Math.round(box.w * factor);
  const ph = Math.round(box.h * factor);
  sizeLabel.textContent = `${pw} × ${ph}`;
}

// ---- dragging a new selection ------------------------------------------------

window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const handle = event.target.dataset?.handle;
  if (handle) {
    drag = { mode: "resize", handle, start: { x: event.clientX, y: event.clientY }, origin: { ...box } };
  } else if (box && inside(event.clientX, event.clientY, box)) {
    drag = { mode: "move", start: { x: event.clientX, y: event.clientY }, origin: { ...box } };
  } else {
    drag = { mode: "create", start: { x: event.clientX, y: event.clientY } };
    box = { x: event.clientX, y: event.clientY, w: 0, h: 0 };
    hint.classList.add("gone");
  }
  try {
    document.body.setPointerCapture(event.pointerId);
  } catch (_) {}
});

function inside(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

window.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const x = event.clientX;
  const y = event.clientY;

  if (drag.mode === "create") {
    const x0 = Math.min(drag.start.x, x);
    const y0 = Math.min(drag.start.y, y);
    box = clampToViewport({ x: x0, y: y0, w: Math.abs(x - drag.start.x), h: Math.abs(y - drag.start.y) });
  } else if (drag.mode === "move") {
    const dx = x - drag.start.x;
    const dy = y - drag.start.y;
    box = clampToViewport({ x: drag.origin.x + dx, y: drag.origin.y + dy, w: drag.origin.w, h: drag.origin.h });
  } else {
    box = resizeBox(drag.origin, drag.handle, x - drag.start.x, y - drag.start.y);
  }
  paint();
});

window.addEventListener("pointerup", (event) => {
  try {
    if (document.body.hasPointerCapture(event.pointerId)) {
      document.body.releasePointerCapture(event.pointerId);
    }
  } catch (_) {}
  if (!drag) return;
  drag = null;

  // A click with no drag means "cancel", not "capture a zero-pixel image".
  if (!box || box.w < 3 || box.h < 3) {
    box = null;
    paint();
    hint.classList.remove("gone");
    return;
  }
  void commit();
});

/** Resize from one of the eight handles. */
function resizeBox(r, handle, dx, dy) {
  let { x, y, w, h } = r;
  if (handle.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (handle.includes("e")) {
    w += dx;
  }
  if (handle.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (handle.includes("s")) {
    h += dy;
  }
  // Dragging a handle past the opposite edge would give a negative size;
  // flip instead of clamping so the gesture keeps working.
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return clampToViewport({ x, y, w, h });
}

async function commit() {
  const rect = [box.x, box.y, box.w, box.h];
  box = null;
  paint();
  try {
    await invoke("finish_capture", { rect });
  } catch (error) {
    console.error("hangboard: capture failed", error);
    await invoke("cancel_capture");
  }
}

// Enter commits, Escape cancels, right-click cancels, double-click grabs full screen.
window.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    await invoke("cancel_capture");
  } else if (event.key === "Enter") {
    if (!box) {
      box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    }
    await commit();
  }
});

window.addEventListener("contextmenu", async (event) => {
  event.preventDefault();
  await invoke("cancel_capture");
});

window.addEventListener("dblclick", async () => {
  box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  paint();
  await commit();
});

async function boot() {
  await listen("capture:begin", (event) => {
    const { backdrop: url, factor: f } = event.payload;
    factor = f || 1;
    backdrop.style.backgroundImage = `url("${url}")`;
    box = null;
    drag = null;
    paint();
    hint.classList.remove("gone");
    try {
      window.focus();
    } catch (_) {}
  });
}

boot().catch((error) => console.error("hangboard: overlay boot failed", error));

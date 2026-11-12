// The region-picking overlay.
//
// Flow: Rust freezes the screen and sends the still as a data URL, along with
// the physical-to-logical factor. The user drags a rectangle here, in CSS
// pixels.
// If annotated, the composite image is rendered and sent to finish_capture.
// If unannotated, Rust crops losslessly from the frozen frame.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const backdrop = document.getElementById("backdrop");
const dimmer = document.getElementById("dimmer");
const selection = document.getElementById("selection");
const canvas = document.getElementById("annotation-canvas");
const sizeLabel = document.getElementById("size");
const hint = document.getElementById("hint");

const toolbar = document.getElementById("toolbar");
const toolbarOptions = document.getElementById("toolbar-options");
const btnUndo = toolbar.querySelector('[data-action="undo"]');
const btnRedo = toolbar.querySelector('[data-action="redo"]');
const btnCancel = toolbar.querySelector('[data-action="cancel"]');
const btnFinish = toolbar.querySelector('[data-action="finish"]');

let factor = 1;
let stillImg = null;
let box = null;
let drag = null;
let isTextActive = false;

// Initialize Annotator
const annotator = new Annotator(canvas, {
  factor: 1,
  initialTool: "none",
  onChange: () => {
    updateUndoRedoState();
  },
  onTextActive: (active) => {
    isTextActive = active;
  },
});

function updateUndoRedoState() {
  btnUndo.disabled = !annotator.canUndo();
  btnRedo.disabled = !annotator.canRedo();
}

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
    toolbar.hidden = true;
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

  // Report physical pixels
  const pw = Math.round(box.w * factor);
  const ph = Math.round(box.h * factor);
  sizeLabel.textContent = `${pw} × ${ph}`;
}

function positionToolbar() {
  if (!box || selection.hidden) {
    toolbar.hidden = true;
    return;
  }
  toolbar.hidden = false;
  const tbRect = toolbar.getBoundingClientRect();
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Place below bottom-right of box by default
  let top = box.y + box.h + margin;
  let left = box.x + box.w - tbRect.width;

  // If not enough room below, place above
  if (top + tbRect.height > vh - margin) {
    top = box.y - tbRect.height - margin;
  }
  if (top < margin) {
    top = margin;
  }
  if (left < margin) {
    left = margin;
  }
  if (left + tbRect.width > vw - margin) {
    left = vw - tbRect.width - margin;
  }

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

function selectTool(tool) {
  if (tool === annotator.currentTool || tool === "none") {
    annotator.setTool("none");
    selection.classList.remove("tool-active");
    toolbar.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => btn.classList.remove("active"));
    toolbarOptions.hidden = true;
  } else {
    annotator.setTool(tool);
    selection.classList.add("tool-active");
    toolbar.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });

    if (tool === "mosaic") {
      toolbarOptions.hidden = true;
    } else {
      toolbarOptions.hidden = false;
    }
  }
  positionToolbar();
}

// ---- Toolbar button handlers ------------------------------------------------

toolbar.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectTool(btn.dataset.tool);
  });
});

toolbar.querySelectorAll(".color-dot").forEach((dot) => {
  dot.addEventListener("click", (e) => {
    e.stopPropagation();
    toolbar.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("active"));
    dot.classList.add("active");
    annotator.setColor(dot.dataset.color);
  });
});

toolbar.querySelectorAll(".size-dot").forEach((dot) => {
  dot.addEventListener("click", (e) => {
    e.stopPropagation();
    toolbar.querySelectorAll(".size-dot").forEach((d) => d.classList.remove("active"));
    dot.classList.add("active");
    annotator.setStrokeWidth(Number(dot.dataset.size));
  });
});

btnUndo.addEventListener("click", (e) => {
  e.stopPropagation();
  annotator.undo();
});

btnRedo.addEventListener("click", (e) => {
  e.stopPropagation();
  annotator.redo();
});

btnCancel.addEventListener("click", (e) => {
  e.stopPropagation();
  void cancel();
});

btnFinish.addEventListener("click", (e) => {
  e.stopPropagation();
  void commit();
});

// ---- Dragging & selecting ---------------------------------------------------

window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (toolbar.contains(event.target)) return;
  if (event.target.classList.contains("annotation-text-input")) return;

  const handle = event.target.dataset?.handle;

  if (handle) {
    drag = { mode: "resize", handle, start: { x: event.clientX, y: event.clientY }, origin: { ...box } };
    toolbar.hidden = true;
  } else if (box && inside(event.clientX, event.clientY, box)) {
    // If a tool is active, let annotator handle drawing!
    if (annotator.currentTool !== "none") {
      return;
    }
    drag = { mode: "move", start: { x: event.clientX, y: event.clientY }, origin: { ...box } };
    toolbar.hidden = true;
  } else {
    // Clicked outside or starting brand new selection
    selectTool("none");
    annotator.clear();
    drag = { mode: "create", start: { x: event.clientX, y: event.clientY } };
    box = { x: event.clientX, y: event.clientY, w: 0, h: 0 };
    hint.classList.add("gone");
    toolbar.hidden = true;
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

  if (!box || box.w < 5 || box.h < 5) {
    box = null;
    paint();
    hint.classList.remove("gone");
    toolbar.hidden = true;
    return;
  }

  // Update annotator canvas and source slice
  annotator.resize(box.w, box.h);
  if (stillImg) {
    annotator.setSource(stillImg, box.x * factor, box.y * factor, box.w * factor, box.h * factor);
  }
  positionToolbar();
});

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
  if (!box) return;
  const rect = [box.x, box.y, box.w, box.h];
  let annotatedDataUrl = null;

  if (annotator && annotator.hasActions() && stillImg) {
    annotatedDataUrl = annotator.exportComposite(
      stillImg,
      box.x * factor,
      box.y * factor,
      box.w * factor,
      box.h * factor
    );
  }

  box = null;
  paint();
  toolbar.hidden = true;
  if (annotator) annotator.clear();
  selectTool("none");

  try {
    await invoke("finish_capture", { rect, annotatedDataUrl });
  } catch (error) {
    console.error("hangboard: capture failed", error);
    await invoke("cancel_capture");
  }
}

async function cancel() {
  box = null;
  paint();
  toolbar.hidden = true;
  if (annotator) annotator.clear();
  selectTool("none");
  await invoke("cancel_capture");
}

// Shortcuts
window.addEventListener("keydown", async (event) => {
  if (isTextActive) return;

  if (event.key === "Escape") {
    if (annotator && annotator.currentTool !== "none") {
      selectTool("none");
    } else {
      await cancel();
    }
  } else if (event.key === "Enter") {
    if (!box) {
      box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      paint();
    }
    await commit();
  } else if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
    event.preventDefault();
    if (event.shiftKey) {
      annotator.redo();
    } else {
      annotator.undo();
    }
  } else if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
    event.preventDefault();
    annotator.redo();
  } else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
    const k = event.key.toLowerCase();
    switch (k) {
      case "r": selectTool("rect"); break;
      case "o": selectTool("ellipse"); break;
      case "a": selectTool("arrow"); break;
      case "p": selectTool("pen"); break;
      case "h": selectTool("highlighter"); break;
      case "m": selectTool("mosaic"); break;
      case "t": selectTool("text"); break;
    }
  }
});

window.addEventListener("contextmenu", async (event) => {
  event.preventDefault();
  if (annotator && annotator.currentTool !== "none") {
    selectTool("none");
  } else {
    await cancel();
  }
});

window.addEventListener("dblclick", async (event) => {
  if (toolbar.contains(event.target)) return;
  box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  paint();
  await commit();
});

async function boot() {
  await listen("capture:begin", (event) => {
    const { backdrop: url, factor: f } = event.payload;
    factor = f || 1;
    backdrop.style.backgroundImage = `url("${url}")`;

    stillImg = new Image();
    stillImg.src = url;

    annotator.setFactor(factor);
    annotator.clear();
    selectTool("none");

    box = null;
    drag = null;
    toolbar.hidden = true;
    paint();
    hint.classList.remove("gone");

    try {
      window.focus();
    } catch (_) {}
  });
}

boot().catch((error) => console.error("hangboard: overlay boot failed", error));

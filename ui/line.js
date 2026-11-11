// The line window's front end.
//
// Its only real job is layout: place each photo at the right spot on the rope,
// tilt it, and tell Rust where the photos ended up so the window knows when to
// accept a click and when to stay click-through.
//
// The geometry numbers come from Rust (`get_geometry`) so both sides agree. A
// mismatch here is a bug you can feel: the hit rectangles would sit a few
// pixels off the photos and clicks would fall through.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const stage = document.getElementById("stage");
const cardsEl = document.getElementById("cards");
const ropeEl = document.getElementById("rope");
const hint = document.getElementById("hint");

let items = [];
let geo = null;
let revealed = false;
let hoveredId = null;
let pendingArrivalIds = new Set();
let lastRevealedAt = 0;
let currentLang = "zh-CN";

function updateLanguage(lang) {
  currentLang = lang;
  const isZh = lang === "zh-CN";
  document.documentElement.setAttribute("lang", isZh ? "zh-CN" : "en");
  hint.textContent = isZh
    ? "截图或复制图片后将悬挂在此处"
    : "Take a screenshot and it will hang here";
}

// Track which ids were already on the line, so a re-render can tell a
// genuinely new photo apart from the rest and give it an arrival animation.
// The very first render is treated as "nothing is new": the photos were loaded
// from disk, not just hung.
let prevIds = new Set();
let firstRender = true;
let lastWindowWidth = window.innerWidth;

/** How long the drop-out animation runs, kept in sync with .card-falling. */
const FALL_MS = 560;

/** The card top sits this far below the rope: the clothespin is 26px tall
    and overlaps the card by 12px, so 26 - 12 - pinAbove(9.5) = 4.5. */
const CARD_DROP = 4.5;

/** Rope height at x: a shallow parabola, so the line sags toward the middle. */
function ropeY(x, width) {
  const sag = Math.min(30, width * 0.018);
  const f = width === 0 ? 0 : x / width;
  return geo.rope_top + 4 * sag * f * (1 - f);
}

/** How many photos fit before the line is full. */
function visibleCount(width) {
  const usable = width - 200;
  return Math.max(3, Math.min(12, Math.floor(usable / geo.spacing)));
}

/** Where the photo at `index` sits, and how far down its peg is. */
function spot(index, count, width) {
  const gaps = Math.max(1, count - 1);
  // Even spacing, but never tighter than the natural spacing unless the line
  // is crowded -- then it packs down to a floor set by the window width.
  const step = Math.min(geo.spacing, Math.max(0, width - 200) / gaps);
  const total = step * (count - 1);
  const x = width / 2 - total / 2 + index * step;
  return { x, y: ropeY(x, width) };
}

function render() {
  const width = window.innerWidth;
  const count = items.length;

  // Which ids arrived since the last render (a new screenshot or a pasted
  // image). Only these get the arrival animation; the rest just settle in.
  const currentIds = new Set(items.map((i) => i.id));
  const newIds = [...currentIds].filter((id) => !prevIds.has(id));
  prevIds = currentIds;

  const isStageHidden = stage.classList.contains("hidden");
  const isTransitioningIn = Date.now() - lastRevealedAt < 380;
  const shouldDelayArrival = isStageHidden || isTransitioningIn;

  if (shouldDelayArrival && !firstRender) {
    newIds.forEach((id) => pendingArrivalIds.add(id));
    if (isTransitioningIn) {
      const remaining = Math.max(50, 240 - (Date.now() - lastRevealedAt));
      schedulePendingArrivals(remaining);
    }
  }

  cardsEl.innerHTML = "";
  hint.classList.toggle("visible", count === 0 && revealed);

  const rects = [];

  // Oldest first, left to right, so a new screenshot lands at the right end
  // where the eye already is after pressing the hotkey.
  const ordered = [...items].reverse();

  ordered.forEach((item, index) => {
    const { x, y } = spot(index, count, width);

    const isNew = newIds.includes(item.id);

    const card = document.createElement("div");
    card.className = "card" + (item.kept ? " kept" : "");
    if (isNew && !firstRender) {
      if (shouldDelayArrival) {
        card.classList.add("pending-arrive");
      } else {
        card.classList.add("arriving");
      }
    }
    card.dataset.id = item.id;

    const w = geo.card_width;
    // Photo height is fixed; the card is that plus its glass inset padding.
    const h = geo.photo_max_height + 8;

    // Position with left/top; the CSS owns rotate (per-photo tilt) and the
    // hover lift, both pivoting on the clothespin top.
    card.style.left = `${x - w / 2}px`;
    card.style.top = `${y + CARD_DROP}px`;
    card.style.width = `${w}px`;
    card.style.setProperty("--tilt", `${item.tilt}deg`);

    const img = document.createElement("img");
    img.src = item.thumb;
    img.alt = "";
    img.draggable = false;
    img.style.maxWidth = `${w - 8}px`;
    img.style.maxHeight = `${geo.photo_max_height}px`;
    card.appendChild(img);

    const peg = document.createElement("div");
    peg.className = "peg";
    card.appendChild(peg);

    const down = document.createElement("div");
    down.className = "corner take-down";
    down.textContent = "✕";
    down.title = "Take down (Delete)";
    card.appendChild(down);

    const pin = document.createElement("div");
    pin.className = "corner pin";
    pin.textContent = item.kept ? "★" : "☆";
    pin.title = item.kept ? "Let it go when the line is full" : "Keep on the line";
    card.appendChild(pin);

    cardsEl.appendChild(card);

    rects.push([x - w / 2, y + CARD_DROP, w, h]);

    card.draggable = true;
    let dragStarted = false;
    let downPos = null;

    function startDragOperation() {
      if (dragStarted) return;
      dragStarted = true;
      void invoke("start_card_drag", { id: item.id }).finally(() => {
        setTimeout(() => {
          dragStarted = false;
        }, 200);
      });
    }

    card.addEventListener("dragstart", (event) => {
      if (
        event.target === down || down.contains(event.target) ||
        event.target === pin || pin.contains(event.target)
      ) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      startDragOperation();
    });

    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (
        event.target === down || down.contains(event.target) ||
        event.target === pin || pin.contains(event.target)
      ) return;
      downPos = { x: event.clientX, y: event.clientY };
    });

    card.addEventListener("pointermove", (event) => {
      if (!downPos || (event.buttons & 1) === 0) return;
      const dist = Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y);
      if (dist > 6) {
        downPos = null;
        startDragOperation();
      }
    });

    card.addEventListener("pointerup", () => {
      downPos = null;
    });

    card.addEventListener("pointercancel", () => {
      downPos = null;
    });

    // One click copies. No double-click handler, so there is no interval to
    // wait out before the clipboard changes.
    card.addEventListener("click", async (event) => {
      if (dragStarted) {
        dragStarted = false;
        return;
      }
      if (event.target === down || down.contains(event.target)) {
        down.style.pointerEvents = "none";
        // Play the drop-out animation, then hand off to Rust to delete and
        // re-render. The card is cloned so the real one can leave the DOM and
        // the clone carries the same left/top/tilt through the fall.
        const gone = card.cloneNode(true);
        gone.classList.remove("arriving");
        gone.classList.add("falling");
        gone.style.pointerEvents = "none";
        cardsEl.appendChild(gone);
        card.style.visibility = "hidden";
        setTimeout(async () => {
          gone.remove();
          await invoke("discard_item", { id: item.id });
        }, FALL_MS);
        return;
      }
      if (event.target === pin || pin.contains(event.target)) {
        await invoke("pin_item", { id: item.id, kept: !item.kept });
        return;
      }
      await invoke("copy_item", { id: item.id });
      card.classList.remove("copied");
      void card.offsetWidth;
      card.classList.add("copied");
      setTimeout(() => card.classList.remove("copied"), 900);
    });

    card.addEventListener("mouseenter", () => {
      hoveredId = item.id;
    });

    card.addEventListener("mouseleave", () => {
      if (hoveredId === item.id) hoveredId = null;
    });

    // Double-click (and Space while hovering) opens the preview lightbox.
    card.addEventListener("dblclick", async () => {
      await invoke("open_preview", { id: item.id });
    });

    // Right-click opens the per-photo context menu.
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      void invoke("open_context", { id: item.id });
    });
  });

  // Rust needs these to decide click-through: it cannot see the CSS layout.
  void invoke("set_hit_rects", { rects });

  // After the first full render, treat every future render as "the line has
  // already been drawn once", so only later arrivals animate in.
  firstRender = false;
  lastWindowWidth = window.innerWidth;
}

function applyGeometry(g) {
  geo = g;
  const root = document.documentElement.style;
  root.setProperty("--photo-h", `${g.photo_max_height}px`);
  root.setProperty("--card-w", `${g.card_width}px`);
  root.setProperty("--panel-h", `${g.panel_height}px`);
  root.setProperty("--rope-top", `${g.rope_top}px`);
  root.setProperty("--pin-above", `${g.pin_above}px`);
  drawRope();
}

/**
 * Draw the rope with three strokes: a soft shadow, the cord, and a thin
 * highlight along the top. One stroke alone reads as a flat line; three read
 * as something with thickness.
 */
function drawRope() {
  const width = window.innerWidth;
  const height = geo.photo_max_height + 40;
  const steps = 60;

  let d = "";
  for (let i = 0; i <= steps; i++) {
    const x = (width * i) / steps;
    const y = ropeY(x, width);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }

  ropeEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
  // The mask fades the rope out at both ends with a gradient in *alpha*.
  // SVG masks key off luminance, so the gradient has to be white: a black
  // gradient would hide the rope completely rather than fade it.
  //
  // Three strokes, 1:1 with Tendedero's LineView.swift:
  //   shadow  black 0.22  width 1.4  offset +1.2  blur 1.2
  //   cord    white 0.55  width 1.2  (Color(white: 0.55) = rgb 140)
  //   glint   white 0.45  width 0.4  offset -0.35
  ropeEl.innerHTML = `
    <defs>
      <linearGradient id="fade" x1="0" x2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="8%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="92%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <mask id="fade-mask">
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#fade)"/>
      </mask>
      <filter id="rope-blur" x="-20%" y="-200%" width="140%" height="500%">
        <feGaussianBlur stdDeviation="1.2"/>
      </filter>
    </defs>
    <g mask="url(#fade-mask)">
      <path d="${d}" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.4"
            stroke-linecap="round" transform="translate(0,1.2)" filter="url(#rope-blur)"/>
      <path d="${d}" fill="none" stroke="rgb(140,140,140)" stroke-width="1.2"
            stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.4"
            stroke-linecap="round" transform="translate(0,-0.35)"/>
    </g>
  `;
}

function schedulePendingArrivals(delayMs) {
  if (pendingArrivalIds.size === 0) return;
  const toAnimate = [...pendingArrivalIds];
  pendingArrivalIds.clear();
  setTimeout(() => {
    toAnimate.forEach((id) => {
      const card = cardsEl.querySelector(`.card[data-id="${id}"]`);
      if (card) {
        card.classList.remove("pending-arrive");
        card.classList.remove("arriving");
        void card.offsetWidth;
        card.classList.add("arriving");
      }
    });
  }, delayMs);
}

function setRevealed(on) {
  revealed = on;
  stage.classList.toggle("hidden", !on);
  hint.classList.toggle("visible", on && items.length === 0);

  if (on) {
    lastRevealedAt = Date.now();
    schedulePendingArrivals(240);
  } else {
    pendingArrivalIds.clear();
  }
}

function showCardFeedback(card, text) {
  card.classList.remove("copied", "feedback-pill");
  void card.offsetWidth;
  card.dataset.feedback = text;
  card.classList.add("feedback-pill");
  setTimeout(() => card.classList.remove("feedback-pill"), 1200);
}

async function boot() {
  try {
    const lang = await invoke("get_language");
    if (lang) updateLanguage(lang);
  } catch (_) {}

  geo = await invoke("get_geometry", { scale: 1 });
  applyGeometry(geo);

  items = await invoke("list_items");
  render();

  await listen("line:items", (event) => {
    items = event.payload;
    render();
  });

  await listen("line:revealed", (event) => setRevealed(event.payload));

  await listen("app:language", (event) => {
    updateLanguage(event.payload);
  });

  await listen("ocr:result", (event) => {
    const { id, result } = event.payload;
    const card = cardsEl.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    const isZh = currentLang === "zh-CN";
    let text = "";
    if (result.has_qr) {
      text = isZh ? "✓ 已识别二维码" : "✓ QR Copied";
    } else if (result.text && result.text.trim()) {
      text = isZh ? "✓ 已提取文字" : "✓ Text Copied";
    } else {
      text = isZh ? "未识别到内容" : "No Content";
    }
    showCardFeedback(card, text);
  });


  await listen("line:geometry", async () => {
    geo = await invoke("get_geometry", { scale: 1 });
    applyGeometry(geo);
    render();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth !== lastWindowWidth) {
      lastWindowWidth = window.innerWidth;
      drawRope();
      render();
    }
  });

  // Escape hides the line; Space opens the preview for the hovered photo.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      void invoke("hide_line");
    } else if (event.key === " " && hoveredId && !event.repeat) {
      event.preventDefault();
      void invoke("open_preview", { id: hoveredId });
    }
  });
}

boot().catch((error) => console.error("hangboard: boot failed", error));

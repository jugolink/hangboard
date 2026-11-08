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

  cardsEl.innerHTML = "";
  hint.classList.toggle("visible", count === 0 && revealed);

  const rects = [];

  // Oldest first, left to right, so a new screenshot lands at the right end
  // where the eye already is after pressing the hotkey.
  const ordered = [...items].reverse();

  ordered.forEach((item, index) => {
    const { x, y } = spot(index, count, width);

    const card = document.createElement("div");
    card.className = "card" + (item.kept ? " kept" : "");
    card.dataset.id = item.id;

    const w = geo.card_width;
    // Photo height is fixed; the card is that plus its padding and the little
    // strip of matte below the image.
    const h = geo.photo_max_height + 10;

    // Tilt is stored per photo so it does not change on every render.
    card.style.width = `${w}px`;
    card.style.transform = `translate(${x - w / 2}px, ${y + geo.pin_above}px) rotate(${item.tilt}deg)`;

    const img = document.createElement("img");
    img.src = item.thumb;
    img.alt = "";
    img.draggable = false;
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

    rects.push([x - w / 2, y + geo.pin_above, w, h]);

    // One click copies. No double-click handler, so there is no interval to
    // wait out before the clipboard changes.
    card.addEventListener("click", async (event) => {
      if (event.target === down || down.contains(event.target)) {
        down.style.pointerEvents = "none";
        await invoke("discard_item", { id: item.id });
        return;
      }
      if (event.target === pin || pin.contains(event.target)) {
        await invoke("pin_item", { id: item.id, kept: !item.kept });
        return;
      }
      await invoke("copy_item", { id: item.id });
      card.classList.add("copied");
      setTimeout(() => card.classList.remove("copied"), 900);
    });

    card.addEventListener("mouseenter", () => void invoke("set_dragging", { dragging: false }));
  });

  // Rust needs these to decide click-through: it cannot see the CSS layout.
  void invoke("set_hit_rects", { rects });
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
    </defs>
    <g mask="url(#fade-mask)">
      <path d="${d}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2.6"
            stroke-linecap="round" filter="blur(1.2px)"/>
      <path d="${d}" fill="none" stroke="rgba(120,116,108,0.95)" stroke-width="1.2"
            stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.4"
            stroke-linecap="round" transform="translate(0,-0.4)"/>
    </g>
  `;
}

function setRevealed(on) {
  revealed = on;
  stage.classList.toggle("hidden", !on);
  hint.classList.toggle("visible", on && items.length === 0);
}

async function boot() {
  geo = await invoke("get_geometry", { scale: 1 });
  applyGeometry(geo);

  items = await invoke("list_items");
  render();

  await listen("line:items", (event) => {
    items = event.payload;
    render();
  });

  await listen("line:revealed", (event) => setRevealed(event.payload));

  await listen("line:geometry", async () => {
    geo = await invoke("get_geometry", { scale: 1 });
    applyGeometry(geo);
    render();
  });

  window.addEventListener("resize", () => {
    drawRope();
    render();
  });

  // Escape hides the line -- the same reflex as closing a popover.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") void invoke("hide_line");
  });
}

boot().catch((error) => console.error("hangboard: boot failed", error));

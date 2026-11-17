/* The demo on the landing page.
 *
 * Browser-only implementation of Hangboard's interactions.
 * Features:
 * - Real rope geometry and card physics
 * - Web Audio API synthesized mechanical peg & drop sound effects
 * - Interactive Canvas screenshot annotation
 * - Interactive offline OCR laser scanner simulation
 * - External App Drag-to-Dock (WeChat, VS Code, Explorer)
 * - Live physical keyboard shortcut visualizer
 * - Bento grid mouse-follow spotlight
 */

(() => {
  "use strict";

  const root = document.documentElement;

  // Geometry matching src-tauri/src/state.rs:107-116
  const GEO = {
    photoMaxHeight: 104,
    cardWidth: 150,
    spacing: 174,
    ropeTop: 10,
    pinAbove: 9.5,
  };

  const CARD_DROP = 4.5;
  const FALL_MS = 560;
  const DRAG_THRESHOLD = 45;

  // Elements
  const desktop = document.getElementById("desktop");
  const hotzone = document.getElementById("hotzone");
  const lineEl = document.getElementById("line");
  const ropeEl = document.getElementById("rope");
  const cardsEl = document.getElementById("cards");
  const hintEl = document.getElementById("hint");
  const desktopHint = document.getElementById("desktop-hint");
  const demoToast = document.getElementById("demo-toast");

  // OCR elements
  const ocrScanner = document.getElementById("ocr-scanner");
  const ocrPopover = document.getElementById("ocr-popover");
  const ocrStatus = document.getElementById("ocr-status");
  const ocrText = document.getElementById("ocr-text");
  const btnOcr = document.getElementById("btn-ocr");
  const btnOcrCopy = document.getElementById("btn-ocr-copy");
  const btnOcrClose = document.getElementById("btn-ocr-close");

  // Annotation elements
  const annotateOverlay = document.getElementById("annotate-overlay");
  const annotateCanvas = document.getElementById("annotate-canvas");
  const btnAnnotate = document.getElementById("btn-annotate");
  const btnAnnotateHang = document.getElementById("btn-annotate-hang");
  const btnAnnotateClose = document.getElementById("btn-annotate-close");

  // Dock targets
  const dockTargets = [
    document.getElementById("target-wechat"),
    document.getElementById("target-vscode"),
    document.getElementById("target-folder"),
  ];

  // Sound elements
  const btnSound = document.getElementById("btn-sound");
  const soundIcon = document.getElementById("sound-icon");
  const soundLabel = document.getElementById("sound-label");

  /** @type {{id:string, img:HTMLImageElement, aspect:number, tilt:number}[]} */
  let items = [];
  let nextId = 1;
  let revealed = false;
  let retractTimer = 0;
  let hintSeen = false;
  let soundEnabled = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- audio synthesizer (Web Audio API) -------------------------------- */

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Primary crisp metal peg click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {}
  }

  function playDropSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.18);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundIcon.textContent = soundEnabled ? "🔊" : "🔇";
    soundLabel.textContent = soundEnabled ? t("soundOn") : t("soundOff");
    if (soundEnabled) playChime();
  }
  btnSound.addEventListener("click", toggleSound);

  /* ---- geometry --------------------------------------------------------- */

  function ropeY(x, width) {
    const sag = Math.min(30, width * 0.018);
    const f = width === 0 ? 0 : x / width;
    return GEO.ropeTop + 4 * sag * f * (1 - f);
  }

  function spot(index, count, width) {
    const gaps = Math.max(1, count - 1);
    const step = Math.min(GEO.spacing, Math.max(0, width - 200) / gaps);
    const total = step * (count - 1);
    const x = width / 2 - total / 2 + index * step;
    return { x, y: ropeY(x, width) };
  }

  /* ---- draw rope -------------------------------------------------------- */

  function drawRope() {
    const width = desktop.clientWidth;
    const height = GEO.photoMaxHeight + 40;
    const steps = 60;

    let d = "";
    for (let i = 0; i <= steps; i++) {
      const x = (width * i) / steps;
      const y = ropeY(x, width);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
    }

    ropeEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ropeEl.innerHTML = `
      <defs>
        <linearGradient id="rope-fade" x1="0" x2="1">
          <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
          <stop offset="8%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="92%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <mask id="rope-mask">
          <rect x="0" y="0" width="${width}" height="${height}" fill="url(#rope-fade)"/>
        </mask>
        <filter id="rope-blur" x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="1.2"/>
        </filter>
      </defs>
      <g mask="url(#rope-mask)">
        <path d="${d}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.6"
              stroke-linecap="round" transform="translate(0,1.2)" filter="url(#rope-blur)"/>
        <path d="${d}" fill="none" stroke="rgb(160,160,160)" stroke-width="1.2"
              stroke-linecap="round"/>
        <path d="${d}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"
              stroke-linecap="round" transform="translate(0,-0.4)"/>
      </g>
    `;
  }

  /* ---- layout & render -------------------------------------------------- */

  function frameSize(aspect) {
    const maxH = GEO.photoMaxHeight;
    const maxW = GEO.cardWidth;
    let h = maxH;
    let w = h * aspect;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  function render(newIds = new Set()) {
    const width = desktop.clientWidth;
    const count = items.length;

    cardsEl.innerHTML = "";
    hintEl.classList.toggle("visible", count === 0 && revealed);

    items.forEach((item, index) => {
      const { x, y } = spot(index, count, width);
      const { w, h } = frameSize(item.aspect);

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = item.id;
      card.style.setProperty("--tilt", `${item.tilt}deg`);
      card.style.left = `${Math.round(x - w / 2 - 4)}px`;
      card.style.top = `${Math.round(y + CARD_DROP)}px`;
      card.style.width = `${w + 8}px`;

      const img = document.createElement("img");
      img.src = item.img.src;
      img.width = w;
      img.height = h;
      img.alt = "";
      img.draggable = false;
      card.appendChild(img);

      const peg = document.createElement("span");
      peg.className = "peg";
      card.appendChild(peg);

      const takeDown = document.createElement("button");
      takeDown.className = "corner take-down";
      takeDown.type = "button";
      takeDown.textContent = "✕";
      takeDown.setAttribute("aria-label", t("takeDown"));
      takeDown.addEventListener("click", (e) => {
        e.stopPropagation();
        drop(item.id);
      });
      card.appendChild(takeDown);

      wireCard(card, item);

      if (newIds.has(item.id) && !reduceMotion.matches) {
        card.classList.add("arriving");
      }

      cardsEl.appendChild(card);
    });
  }

  /* ---- toast notification in desktop ------------------------------------ */

  let toastTimer = 0;
  function showToast(text) {
    demoToast.textContent = text;
    demoToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      demoToast.classList.remove("show");
    }, 2200);
  }

  /* ---- card interactions (click to copy, drag to dock or drop) --------- */

  function checkDockOverlap(clientX, clientY) {
    for (const target of dockTargets) {
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return target;
      }
    }
    return null;
  }

  function wireCard(card, item) {
    let startX = 0;
    let startY = 0;
    let moved = false;
    let captured = false;
    let hoveredTarget = null;

    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".corner")) return;
      startX = e.clientX;
      startY = e.clientY;
      moved = false;
      captured = true;
      hoveredTarget = null;
      card.setPointerCapture(e.pointerId);
    });

    card.addEventListener("pointermove", (e) => {
      if (!captured) return;
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      if (Math.abs(dy) > 5 || Math.abs(dx) > 5) moved = true;

      if (moved) {
        card.style.transform = `translate(${dx}px, ${dy}px) rotate(${item.tilt * 1.5}deg) scale(1.05)`;
        card.style.opacity = "0.9";
        card.style.zIndex = "100";

        // Check if hovering over any dock target
        const target = checkDockOverlap(e.clientX, e.clientY);
        if (target !== hoveredTarget) {
          if (hoveredTarget) hoveredTarget.classList.remove("drag-over");
          hoveredTarget = target;
          if (hoveredTarget) hoveredTarget.classList.add("drag-over");
        }
      }
    });

    card.addEventListener("pointerup", (e) => {
      if (!captured) return;
      captured = false;
      const dy = e.clientY - startY;

      if (hoveredTarget) {
        hoveredTarget.classList.remove("drag-over");
        const appName = hoveredTarget.dataset.app || "App";
        showToast(`${t("droppedTo")} ${appName}`);
        playChime();
        drop(item.id);
        return;
      }

      if (dy > DRAG_THRESHOLD) {
        drop(item.id);
        return;
      }

      card.style.transform = "";
      card.style.opacity = "";
      card.style.zIndex = "";

      if (!moved) copyItem(card, item);
    });

    card.addEventListener("pointercancel", () => {
      captured = false;
      if (hoveredTarget) hoveredTarget.classList.remove("drag-over");
      card.style.transform = "";
      card.style.opacity = "";
      card.style.zIndex = "";
    });
  }

  function copyItem(card, item) {
    if (navigator.clipboard && window.ClipboardItem) {
      const canvas = document.createElement("canvas");
      canvas.width = item.img.naturalWidth;
      canvas.height = item.img.naturalHeight;
      canvas.getContext("2d").drawImage(item.img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": blob })])
          .catch(() => {});
      }, "image/png");
    }

    playChime();
    card.dataset.copied = t("copied");
    card.classList.remove("copied");
    void card.offsetWidth;
    card.classList.add("copied");
    setTimeout(() => card.classList.remove("copied"), 1000);
  }

  function drop(id) {
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) return;

    playDropSound();
    const card = cardsEl.querySelector(`.card[data-id="${id}"]`);
    if (card && !reduceMotion.matches) {
      card.style.transform = "";
      card.style.opacity = "";
      card.classList.add("falling");
      items.splice(index, 1);
      setTimeout(() => render(), FALL_MS);
    } else {
      items.splice(index, 1);
      render();
    }

    scheduleRetract();
  }

  /* ---- reveal / retract ------------------------------------------------- */

  function reveal() {
    if (revealed) return;
    revealed = true;
    clearTimeout(retractTimer);
    lineEl.classList.remove("retracting");
    lineEl.classList.add("revealed");
    hintEl.classList.toggle("visible", items.length === 0);
    if (!hintSeen) {
      hintSeen = true;
      desktopHint.classList.add("gone");
    }
  }

  function retract() {
    if (!revealed) return;
    revealed = false;
    lineEl.classList.add("retracting");
    lineEl.classList.remove("revealed");
    hintEl.classList.remove("visible");
  }

  function scheduleRetract() {
    clearTimeout(retractTimer);
    retractTimer = setTimeout(() => {
      if (!lineEl.matches(":hover") && !cardsEl.matches(":hover")) retract();
    }, 2200);
  }

  hotzone.addEventListener("pointerenter", reveal);
  lineEl.addEventListener("pointerenter", () => {
    clearTimeout(retractTimer);
    reveal();
  });
  lineEl.addEventListener("pointerleave", scheduleRetract);
  desktop.addEventListener("pointerleave", () => {
    clearTimeout(retractTimer);
    retractTimer = setTimeout(retract, 700);
  });

  /* ---- making demo screenshots ------------------------------------------ */

  function makeShot(variant) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");

    const palettes = [
      ["#1a202c", "#e2e8f0", "#2d3748"],
      ["#0f172a", "#f8fafc", "#1e293b"],
      ["#18181b", "#fafafa", "#27272a"],
      ["#131d2a", "#edf2f7", "#243242"],
    ];
    const [bg, ink, chrome] = palettes[variant % palettes.length];

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 640, 400);

    // Title bar
    ctx.fillStyle = chrome;
    ctx.fillRect(0, 0, 640, 36);
    ["#ef4444", "#f59e0b", "#10b981"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(22 + i * 22, 18, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Code lines or content
    ctx.fillStyle = ink;
    const rows = [
      [44, 80, 0.58, 14],
      [44, 114, 0.82, 10],
      [44, 138, 0.65, 10],
      [44, 162, 0.74, 10],
      [44, 206, 0.42, 14],
      [44, 238, 0.68, 10],
      [44, 262, 0.54, 10],
    ];
    rows.forEach(([x, y, wFrac, h]) => {
      ctx.globalAlpha = h === 14 ? 0.85 : 0.35;
      ctx.fillRect(x, y, 550 * wFrac, h);
    });
    ctx.globalAlpha = 1;

    // Feature card block
    ctx.fillStyle = chrome;
    ctx.fillRect(44, 296, 220, 76);
    ctx.fillStyle = "#e5b94c";
    ctx.globalAlpha = 0.85;
    ctx.fillRect(64, 318, 50, 32);
    ctx.globalAlpha = 1;

    return canvas.toDataURL("image/png");
  }

  function hang(src) {
    const img = new Image();
    img.onload = () => {
      const item = {
        id: `demo-${nextId++}`,
        img,
        aspect: img.naturalWidth / img.naturalHeight,
        tilt: Math.round((Math.random() * 4 - 2) * 100) / 100,
      };
      items.push(item);
      if (items.length > 8) items.shift();
      render(new Set([item.id]));
      reveal();
      playChime();
      scheduleRetract();
    };
    img.src = src;
  }

  let shotCount = 0;
  document.getElementById("btn-shot").addEventListener("click", () => {
    hang(makeShot(shotCount++));
  });

  document.getElementById("btn-paste").addEventListener("click", async () => {
    try {
      const entries = await navigator.clipboard.read();
      for (const entry of entries) {
        const type = entry.types.find((x) => x.startsWith("image/"));
        if (!type) continue;
        const blob = await entry.getType(type);
        hang(URL.createObjectURL(blob));
        return;
      }
      flashButton("btn-paste", t("noImage"));
    } catch {
      flashButton("btn-paste", t("pasteBlocked"));
    }
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    items.forEach((item) => {
      const card = cardsEl.querySelector(`.card[data-id="${item.id}"]`);
      if (card && !reduceMotion.matches) card.classList.add("falling");
    });
    const had = items.length;
    items = [];
    playDropSound();
    setTimeout(() => render(), had && !reduceMotion.matches ? FALL_MS : 0);
  });

  // Ctrl+V paste listener
  document.addEventListener("paste", (e) => {
    const found = [...(e.clipboardData?.items || [])].find((i) =>
      i.type.startsWith("image/")
    );
    if (!found) return;
    const file = found.getAsFile();
    if (!file) return;
    e.preventDefault();
    hang(URL.createObjectURL(file));
  });

  function flashButton(id, text) {
    const btn = document.getElementById(id);
    const label = btn.querySelector("span:last-child");
    const original = label.textContent;
    label.textContent = text;
    setTimeout(() => {
      label.textContent = original;
    }, 1600);
  }

  /* ---- interactive annotation modal ------------------------------------- */

  let currentTool = "rect";
  const annotateCtx = annotateCanvas.getContext("2d");
  let isAnnotating = false;
  let startAnnotateX = 0;
  let startAnnotateY = 0;
  let snapshotImg = null;

  function initAnnotationCanvas() {
    const w = annotateCanvas.width;
    const h = annotateCanvas.height;
    annotateCtx.fillStyle = "#1e2433";
    annotateCtx.fillRect(0, 0, w, h);

    // Draw mockup UI screenshot to annotate on
    annotateCtx.fillStyle = "#2d3748";
    annotateCtx.fillRect(20, 20, w - 40, 30);
    annotateCtx.fillStyle = "#e5b94c";
    annotateCtx.font = "bold 13px system-ui";
    annotateCtx.fillText("Hangboard Codebase (Annotation Mode)", 32, 40);

    annotateCtx.fillStyle = "#94a3b8";
    annotateCtx.font = "12px monospace";
    annotateCtx.fillText("const hangboard = new HangboardClient({ offline: true });", 32, 80);
    annotateCtx.fillText("hangboard.hang(screenshot); // Ready to drag & drop", 32, 105);

    // Initial highlighter sample
    annotateCtx.fillStyle = "rgba(229, 185, 76, 0.35)";
    annotateCtx.fillRect(30, 93, 260, 18);

    saveSnapshot();
  }

  function saveSnapshot() {
    snapshotImg = annotateCtx.getImageData(0, 0, annotateCanvas.width, annotateCanvas.height);
  }

  btnAnnotate.addEventListener("click", () => {
    annotateOverlay.style.display = "flex";
    initAnnotationCanvas();
    playChime();
  });

  btnAnnotateClose.addEventListener("click", () => {
    annotateOverlay.style.display = "none";
  });

  btnAnnotateHang.addEventListener("click", () => {
    const dataUrl = annotateCanvas.toDataURL("image/png");
    annotateOverlay.style.display = "none";
    hang(dataUrl);
    showToast(t("annotateHang"));
  });

  // Switch tools
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTool = btn.dataset.tool;
    });
  });

  annotateCanvas.addEventListener("pointerdown", (e) => {
    const rect = annotateCanvas.getBoundingClientRect();
    startAnnotateX = e.clientX - rect.left;
    startAnnotateY = e.clientY - rect.top;
    isAnnotating = true;
    saveSnapshot();
  });

  annotateCanvas.addEventListener("pointermove", (e) => {
    if (!isAnnotating) return;
    const rect = annotateCanvas.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    annotateCtx.putImageData(snapshotImg, 0, 0);

    if (currentTool === "rect") {
      annotateCtx.strokeStyle = "#e5b94c";
      annotateCtx.lineWidth = 3;
      annotateCtx.strokeRect(startAnnotateX, startAnnotateY, curX - startAnnotateX, curY - startAnnotateY);
    } else if (currentTool === "arrow") {
      annotateCtx.strokeStyle = "#ef4444";
      annotateCtx.fillStyle = "#ef4444";
      annotateCtx.lineWidth = 3;
      annotateCtx.beginPath();
      annotateCtx.moveTo(startAnnotateX, startAnnotateY);
      annotateCtx.lineTo(curX, curY);
      annotateCtx.stroke();
      // Arrow head
      const angle = Math.atan2(curY - startAnnotateY, curX - startAnnotateX);
      annotateCtx.beginPath();
      annotateCtx.moveTo(curX, curY);
      annotateCtx.lineTo(curX - 12 * Math.cos(angle - Math.PI / 6), curY - 12 * Math.sin(angle - Math.PI / 6));
      annotateCtx.lineTo(curX - 12 * Math.cos(angle + Math.PI / 6), curY - 12 * Math.sin(angle + Math.PI / 6));
      annotateCtx.closePath();
      annotateCtx.fill();
    } else if (currentTool === "highlighter") {
      annotateCtx.fillStyle = "rgba(56, 189, 248, 0.4)";
      annotateCtx.fillRect(startAnnotateX, startAnnotateY, curX - startAnnotateX, curY - startAnnotateY);
    } else if (currentTool === "mosaic") {
      annotateCtx.fillStyle = "rgba(100, 116, 139, 0.75)";
      const w = curX - startAnnotateX;
      const h = curY - startAnnotateY;
      annotateCtx.fillRect(startAnnotateX, startAnnotateY, w, h);
      annotateCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      annotateCtx.lineWidth = 1;
      annotateCtx.strokeRect(startAnnotateX, startAnnotateY, w, h);
    } else if (currentTool === "brush") {
      annotateCtx.strokeStyle = "#10b981";
      annotateCtx.lineWidth = 3;
      annotateCtx.beginPath();
      annotateCtx.moveTo(startAnnotateX, startAnnotateY);
      annotateCtx.lineTo(curX, curY);
      annotateCtx.stroke();
    }
  });

  annotateCanvas.addEventListener("pointerup", () => {
    if (!isAnnotating) return;
    isAnnotating = false;
    saveSnapshot();
  });

  /* ---- interactive offline OCR simulation -------------------------------- */

  btnOcr.addEventListener("click", () => {
    reveal();
    ocrScanner.classList.add("active");
    ocrStatus.textContent = t("ocrScanning");
    playChime();

    setTimeout(() => {
      ocrScanner.classList.remove("active");
      ocrPopover.style.display = "block";
      ocrStatus.textContent = t("ocrDone");
      ocrText.value = t("ocrSampleText");
      playChime();

      // Deliberately no clipboard write here. This is a simulation on a public
      // page; silently replacing whatever the visitor had on their clipboard
      // is not ours to do. The copy button below is explicit.
      showToast(t("ocrDone"));
    }, 1200);
  });

  btnOcrClose.addEventListener("click", () => {
    ocrPopover.style.display = "none";
  });

  btnOcrCopy.addEventListener("click", () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ocrText.value).catch(() => {});
    }
    flashButton("btn-ocr-copy", t("copied"));
    playChime();
  });

  /* ---- physical keyboard shortcut visualizer ---------------------------- */

  const pressedKeys = new Set();
  const hotkeyBoard = document.getElementById("hotkeys-board");

  window.addEventListener("keydown", (e) => {
    // Holding a chord down repeats the event. The visual highlight is
    // idempotent, but the action is not: without this guard, resting on
    // Ctrl+Alt+H hangs a new photo on every repeat.
    if (e.repeat) {
      updateKeyVisuals();
      return;
    }

    pressedKeys.add(e.key.toLowerCase());
    if (e.key === "Control") pressedKeys.add("control");
    if (e.key === "Alt") pressedKeys.add("alt");
    if (e.key === "Shift") pressedKeys.add("shift");

    updateKeyVisuals();
    runHotkeyAction();
  });

  window.addEventListener("keyup", (e) => {
    pressedKeys.delete(e.key.toLowerCase());
    if (e.key === "Control") pressedKeys.delete("control");
    if (e.key === "Alt") pressedKeys.delete("alt");
    if (e.key === "Shift") pressedKeys.delete("shift");

    // Highlight only. Releasing a modifier makes the remaining chord match a
    // *shorter* row — let go of Shift after Ctrl+Alt+Shift+H and the set now
    // reads as Ctrl+Alt+H. Running actions here would fire a shortcut the
    // visitor never pressed.
    updateKeyVisuals();
  });

  /** The single longest chord whose keys are all currently held. */
  function resolveChord() {
    if (!hotkeyBoard) return null;
    let winner = null;
    let winnerLen = -1;
    for (const row of hotkeyBoard.querySelectorAll(".keyrow")) {
      const keys = (row.dataset.keys || "").toLowerCase().split(",");
      const allActive =
        keys.length > 0 && keys.every((k) => pressedKeys.has(k.trim()));
      if (!allActive) continue;
      if (keys.length > winnerLen) {
        winner = { row, keys };
        winnerLen = keys.length;
      }
    }
    return winner;
  }

  function updateKeyVisuals() {
    if (!hotkeyBoard) return;
    hotkeyBoard.querySelectorAll("kbd").forEach((kbd) => {
      const key = (kbd.dataset.key || "").toLowerCase();
      kbd.classList.toggle("pressed", pressedKeys.has(key));
    });

    // Ctrl+Alt+Shift+H contains Ctrl+Alt+H, so a naive "every key is pressed"
    // test lights up both rows — one press would appear to be two shortcuts.
    // Highlight only the longest match.
    const winner = resolveChord();
    hotkeyBoard
      .querySelectorAll(".keyrow")
      .forEach((row) => row.classList.toggle("active", winner?.row === row));
  }

  function runHotkeyAction() {
    const winner = resolveChord();
    if (!winner) return;

    playChime();
    if (winner.keys.includes("l")) {
      if (revealed) retract();
      else reveal();
    } else if (winner.keys.includes("h")) {
      hang(makeShot(shotCount++));
    }
  }

  /* ---- spotlight hover effect on Bento cards ---------------------------- */

  document.querySelectorAll(".bento-card[data-spotlight]").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.background = `radial-gradient(400px circle at ${x}px ${y}px, var(--bg-card-hover), var(--bg-card) 60%)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.background = "";
    });
  });

  /* ---- language --------------------------------------------------------- */

  function t(key) {
    return (window.HB_I18N?.[root.lang] || window.HB_I18N?.["zh-CN"])?.[key] || key;
  }

  window.hbDemoRefreshLanguage = () => {
    cardsEl.querySelectorAll(".corner.take-down").forEach((btn) => {
      btn.setAttribute("aria-label", t("takeDown"));
    });
    if (soundLabel) {
      soundLabel.textContent = soundEnabled ? t("soundOn") : t("soundOff");
    }
  };

  /* ---- boot ------------------------------------------------------------- */

  function layout() {
    drawRope();
    render();
  }

  window.addEventListener("resize", layout);
  layout();

  const timeEl = document.getElementById("tb-time");
  function tick() {
    const d = new Date();
    timeEl.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  }
  tick();
  setInterval(tick, 30000);

  // Initial load
  setTimeout(() => {
    hintSeen = true;
    desktopHint.classList.add("gone");
    hang(makeShot(0));
    setTimeout(() => hang(makeShot(1)), 240);
  }, 500);
})();

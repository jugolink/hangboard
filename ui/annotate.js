// Annotation Engine for Hangboard (Instant Markup & Graffiti)

class Annotator {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.factor = options.factor || window.devicePixelRatio || 1;
    this.onChange = options.onChange || (() => {});
    this.onTextActive = options.onTextActive || (() => {});

    this.actions = [];
    this.redoStack = [];
    this.currentTool = options.initialTool || "none"; // 'rect' | 'ellipse' | 'arrow' | 'pen' | 'highlighter' | 'mosaic' | 'text' | 'none'
    this.strokeColor = "#ef4444";
    this.strokeWidth = 4;
    this.fontSize = 18;

    this.width = 0;
    this.height = 0;
    this.isDrawing = false;
    this.activeAction = null;
    this.sourceCanvas = null; // Offscreen canvas storing cropped source image for mosaic sampling
    this.sourceCtx = null;

    this._updateCursor();
    this._bindEvents();
  }

  setFactor(factor) {
    this.factor = factor || 1;
  }

  setSource(imageElement, cropX = 0, cropY = 0, cropW = 0, cropH = 0) {
    if (!cropW || !cropH) return;
    const sw = this.width || Math.round(cropW);
    const sh = this.height || Math.round(cropH);
    this.sourceCanvas = document.createElement("canvas");
    this.sourceCanvas.width = sw;
    this.sourceCanvas.height = sh;
    this.sourceCtx = this.sourceCanvas.getContext("2d", { willReadFrequently: true });
    try {
      this.sourceCtx.drawImage(
        imageElement,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        sw,
        sh
      );
    } catch (_) {
      // The still may not have decoded yet (or the source rect falls outside
      // it). Dropping the sample only costs mosaic fidelity: every other tool
      // still draws, and _drawAction already falls back to a flat block fill
      // when sourceCtx is missing.
      this.sourceCanvas = null;
      this.sourceCtx = null;
    }
  }

  resize(w, h) {
    this.width = Math.round(w);
    this.height = Math.round(h);
    this.canvas.width = Math.round(this.width * this.factor);
    this.canvas.height = Math.round(this.height * this.factor);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.redraw();
  }

  setTool(tool) {
    this.currentTool = tool;
    this._updateCursor();
  }

  setColor(color) {
    this.strokeColor = color;
  }

  setStrokeWidth(width) {
    this.strokeWidth = width;
    if (width <= 2) this.fontSize = 14;
    else if (width <= 4) this.fontSize = 18;
    else this.fontSize = 24;
  }

  hasActions() {
    return this.actions.length > 0;
  }

  canUndo() {
    return this.actions.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (this.actions.length === 0) return;
    const action = this.actions.pop();
    this.redoStack.push(action);
    this.redraw();
    this.onChange();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const action = this.redoStack.pop();
    this.actions.push(action);
    this.redraw();
    this.onChange();
  }

  clear() {
    this.actions = [];
    this.redoStack = [];
    this.redraw();
    this.onChange();
  }

  _updateCursor() {
    if (this.currentTool === "none") {
      this.canvas.style.cursor = "default";
      this.canvas.style.pointerEvents = "none";
    } else if (this.currentTool === "text") {
      this.canvas.style.cursor = "text";
      this.canvas.style.pointerEvents = "auto";
    } else {
      this.canvas.style.cursor = "crosshair";
      this.canvas.style.pointerEvents = "auto";
    }
  }

  _getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(this.height, e.clientY - rect.top)),
    };
  }

  _bindEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    window.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", (e) => this._onPointerUp(e));
  }

  _onPointerDown(e) {
    if (e.button !== 0 || this.currentTool === "none") return;
    const pt = this._getCanvasPoint(e);

    if (this.currentTool === "text") {
      this._createTextInput(pt.x, pt.y);
      return;
    }

    this.isDrawing = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const baseProps = {
      color: this.strokeColor,
      width: this.strokeWidth,
    };

    switch (this.currentTool) {
      case "rect":
        this.activeAction = { type: "rect", x: pt.x, y: pt.y, w: 0, h: 0, ...baseProps };
        break;
      case "ellipse":
        this.activeAction = { type: "ellipse", x: pt.x, y: pt.y, w: 0, h: 0, ...baseProps };
        break;
      case "arrow":
        this.activeAction = { type: "arrow", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, ...baseProps };
        break;
      case "pen":
        this.activeAction = { type: "pen", points: [pt], ...baseProps };
        break;
      case "highlighter":
        this.activeAction = { type: "highlighter", points: [pt], ...baseProps };
        break;
      case "mosaic":
        this.activeAction = { type: "mosaic", x: pt.x, y: pt.y, w: 0, h: 0, blockSize: 12 };
        break;
    }
  }

  _onPointerMove(e) {
    if (!this.isDrawing || !this.activeAction) return;
    const pt = this._getCanvasPoint(e);

    switch (this.activeAction.type) {
      case "rect":
      case "ellipse":
      case "mosaic":
        this.activeAction.w = pt.x - this.activeAction.x;
        this.activeAction.h = pt.y - this.activeAction.y;
        break;
      case "arrow":
        this.activeAction.x2 = pt.x;
        this.activeAction.y2 = pt.y;
        break;
      case "pen":
      case "highlighter":
        this.activeAction.points.push(pt);
        break;
    }
    this.redraw();
  }

  _onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (this.activeAction) {
      let valid = true;
      if (["rect", "ellipse", "mosaic"].includes(this.activeAction.type)) {
        valid = Math.abs(this.activeAction.w) >= 3 && Math.abs(this.activeAction.h) >= 3;
      } else if (this.activeAction.type === "arrow") {
        const dx = this.activeAction.x2 - this.activeAction.x1;
        const dy = this.activeAction.y2 - this.activeAction.y1;
        valid = Math.hypot(dx, dy) >= 6;
      } else if (["pen", "highlighter"].includes(this.activeAction.type)) {
        valid = this.activeAction.points.length > 0;
      }

      if (valid) {
        this.actions.push(this.activeAction);
        this.redoStack = [];
        this.onChange();
      }
      this.activeAction = null;
      this.redraw();
    }
  }

  _createTextInput(x, y) {
    const parent = this.canvas.parentElement;
    const existing = parent.querySelector(".annotation-text-input");
    if (existing) existing.remove();

    const input = document.createElement("div");
    input.className = "annotation-text-input";
    input.contentEditable = "true";
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.color = this.strokeColor;
    input.style.fontSize = `${this.fontSize}px`;
    parent.appendChild(input);

    this.onTextActive(true);

    requestAnimationFrame(() => {
      input.focus();
    });

    const commitText = () => {
      const text = input.innerText.trim();
      if (text) {
        this.actions.push({
          type: "text",
          x,
          y,
          text,
          color: this.strokeColor,
          fontSize: this.fontSize,
        });
        this.redoStack = [];
        this.onChange();
      }
      input.remove();
      this.onTextActive(false);
      this.redraw();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        input.remove();
        this.onTextActive(false);
      } else if (e.key === "Enter" && !e.shiftKey) {
        // Both, and in this order: preventDefault keeps the newline out of the
        // contenteditable, stopPropagation keeps the same Enter from reaching
        // the window handler, which would otherwise commit the capture the
        // instant a text annotation is finished.
        e.preventDefault();
        e.stopPropagation();
        commitText();
      }
    });

    input.addEventListener("blur", () => {
      commitText();
    });
  }

  redraw() {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.scale(this.factor, this.factor);

    for (const action of this.actions) {
      this._drawAction(this.ctx, action);
    }
    if (this.activeAction) {
      this._drawAction(this.ctx, this.activeAction);
    }
    this.ctx.restore();
  }

  _drawAction(ctx, action) {
    ctx.save();

    switch (action.type) {
      case "rect": {
        const x = Math.min(action.x, action.x + action.w);
        const y = Math.min(action.y, action.y + action.h);
        const w = Math.abs(action.w);
        const h = Math.abs(action.h);
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.width;
        ctx.lineJoin = "miter";
        ctx.strokeRect(x, y, w, h);
        break;
      }

      case "ellipse": {
        const cx = action.x + action.w / 2;
        const cy = action.y + action.h / 2;
        const rx = Math.abs(action.w / 2);
        const ry = Math.abs(action.h / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.width;
        ctx.stroke();
        break;
      }

      case "arrow": {
        const { x1, y1, x2, y2, color, width } = action;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headlen = Math.max(12, width * 3.2);

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";

        // Shaft connects cleanly to arrowhead base
        const shaftEndX = x2 - headlen * 0.5 * Math.cos(angle);
        const shaftEndY = y2 - headlen * 0.5 * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        // Solid sharp arrowhead
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headlen * Math.cos(angle - Math.PI / 7),
          y2 - headlen * Math.sin(angle - Math.PI / 7)
        );
        ctx.lineTo(
          x2 - headlen * 0.65 * Math.cos(angle),
          y2 - headlen * 0.65 * Math.sin(angle)
        );
        ctx.lineTo(
          x2 - headlen * Math.cos(angle + Math.PI / 7),
          y2 - headlen * Math.sin(angle + Math.PI / 7)
        );
        ctx.closePath();
        ctx.fill();
        break;
      }

      case "pen": {
        if (!action.points || action.points.length === 0) break;
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (action.points.length === 1) {
          ctx.beginPath();
          ctx.arc(action.points[0].x, action.points[0].y, action.width / 2, 0, Math.PI * 2);
          ctx.fillStyle = action.color;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
          ctx.stroke();
        }
        break;
      }

      case "highlighter": {
        if (!action.points || action.points.length === 0) break;
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = action.color;
        ctx.lineWidth = Math.max(16, action.width * 3.5);
        ctx.lineCap = "square";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
        break;
      }

      case "mosaic": {
        const x = Math.min(action.x, action.x + action.w);
        const y = Math.min(action.y, action.y + action.h);
        const w = Math.abs(action.w);
        const h = Math.abs(action.h);
        const block = action.blockSize || 12;

        if (this.sourceCtx) {
          try {
            const startX = Math.max(0, Math.floor(x));
            const startY = Math.max(0, Math.floor(y));
            const endX = Math.min(this.width, Math.ceil(x + w));
            const endY = Math.min(this.height, Math.ceil(y + h));
            const rw = endX - startX;
            const rh = endY - startY;

            if (rw > 0 && rh > 0) {
              const imgData = this.sourceCtx.getImageData(startX, startY, rw, rh);
              const data = imgData.data;
              const iw = imgData.width;
              const ih = imgData.height;

              for (let by = 0; by < ih; by += block) {
                for (let bx = 0; bx < iw; bx += block) {
                  const sampleX = Math.min(bx + Math.floor(block / 2), iw - 1);
                  const sampleY = Math.min(by + Math.floor(block / 2), ih - 1);
                  const idx = (sampleY * iw + sampleX) * 4;
                  const r = data[idx];
                  const g = data[idx + 1];
                  const b = data[idx + 2];
                  const a = data[idx + 3] / 255;

                  ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
                  ctx.fillRect(
                    startX + bx,
                    startY + by,
                    Math.min(block, iw - bx),
                    Math.min(block, ih - by)
                  );
                }
              }
            }
          } catch (_) {
            ctx.fillStyle = "rgba(100, 100, 100, 0.75)";
            ctx.fillRect(x, y, w, h);
          }
        } else {
          ctx.fillStyle = "rgba(120, 120, 120, 0.75)";
          ctx.fillRect(x, y, w, h);
        }
        break;
      }

      case "text": {
        ctx.font = `bold ${action.fontSize || 18}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = "top";

        // Double shadow for high contrast on light or dark backgrounds
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.fillStyle = action.color;
        const lines = action.text.split(/\r?\n/);
        const lineHeight = (action.fontSize || 18) * 1.35;
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], action.x, action.y + i * lineHeight);
        }
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Export the composite screenshot + annotations as a high-resolution PNG data URL.
   */
  exportComposite(imageElement, cropX, cropY, cropW, cropH) {
    const outCanvas = document.createElement("canvas");
    const outW = Math.round(cropW);
    const outH = Math.round(cropH);
    outCanvas.width = outW;
    outCanvas.height = outH;

    const outCtx = outCanvas.getContext("2d");
    // Draw original cropped screenshot. If the still has not decoded yet there
    // is nothing to composite onto, so fall back to a transparent sheet rather
    // than throwing away the annotations the user just drew.
    try {
      outCtx.drawImage(
        imageElement,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        outW,
        outH
      );
    } catch (_) {
      // leave the sheet empty
    }

    // Scale context to match physical factor and draw vector annotations on top
    const scale = outW / (this.width || 1);
    outCtx.save();
    outCtx.scale(scale, scale);
    for (const action of this.actions) {
      this._drawAction(outCtx, action);
    }
    outCtx.restore();

    return outCanvas.toDataURL("image/png");
  }
}

window.Annotator = Annotator;

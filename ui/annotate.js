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
    // 'none' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'pen' | 'highlighter' | 'mosaic' | 'blur' | 'text' | 'step'
    this.currentTool = options.initialTool || "none";
    this.strokeColor = "#ef4444";
    this.strokeWidth = 4;
    this.fontSize = 18;
    this.isFilled = false;
    this.mosaicMode = "rect"; // 'rect' | 'brush'

    this.width = 0;
    this.height = 0;
    this.isDrawing = false;
    this.activeAction = null;

    this.sourceCanvas = null;
    this.sourceCtx = null;
    this.blurCanvas = null;
    this.mosaicCanvas = null;

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

      // Pre-render smooth blur layer
      this.blurCanvas = document.createElement("canvas");
      this.blurCanvas.width = sw;
      this.blurCanvas.height = sh;
      const bCtx = this.blurCanvas.getContext("2d");
      bCtx.filter = "blur(10px)";
      bCtx.drawImage(this.sourceCanvas, 0, 0);

      // Pre-render pixelated mosaic layer
      this.mosaicCanvas = document.createElement("canvas");
      this.mosaicCanvas.width = sw;
      this.mosaicCanvas.height = sh;
      const mCtx = this.mosaicCanvas.getContext("2d");
      mCtx.imageSmoothingEnabled = false;
      const blockSize = 10;
      const smW = Math.max(1, Math.floor(sw / blockSize));
      const smH = Math.max(1, Math.floor(sh / blockSize));
      const tCanvas = document.createElement("canvas");
      tCanvas.width = smW;
      tCanvas.height = smH;
      tCanvas.getContext("2d").drawImage(this.sourceCanvas, 0, 0, smW, smH);
      mCtx.drawImage(tCanvas, 0, 0, smW, smH, 0, 0, sw, sh);
    } catch (_) {
      this.sourceCanvas = null;
      this.sourceCtx = null;
      this.blurCanvas = null;
      this.mosaicCanvas = null;
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
    this.strokeWidth = Math.max(2, Math.min(48, width));
    if (this.strokeWidth <= 2) this.fontSize = 14;
    else if (this.strokeWidth <= 4) this.fontSize = 18;
    else this.fontSize = 24;
  }

  toggleFilled() {
    this.isFilled = !this.isFilled;
    return this.isFilled;
  }

  setMosaicMode(mode) {
    this.mosaicMode = mode;
  }

  getNextStepNumber() {
    return this.actions.filter((a) => a.type === "step").length + 1;
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
        this.activeAction = {
          type: "rect",
          x: pt.x,
          y: pt.y,
          w: 0,
          h: 0,
          isFilled: this.isFilled,
          ...baseProps,
        };
        break;

      case "ellipse":
        this.activeAction = {
          type: "ellipse",
          x: pt.x,
          y: pt.y,
          w: 0,
          h: 0,
          isFilled: this.isFilled,
          ...baseProps,
        };
        break;

      case "line":
        this.activeAction = {
          type: "line",
          x1: pt.x,
          y1: pt.y,
          x2: pt.x,
          y2: pt.y,
          ...baseProps,
        };
        break;

      case "arrow":
        this.activeAction = {
          type: "arrow",
          x1: pt.x,
          y1: pt.y,
          x2: pt.x,
          y2: pt.y,
          ...baseProps,
        };
        break;

      case "pen":
        this.activeAction = { type: "pen", points: [pt], ...baseProps };
        break;

      case "highlighter":
        this.activeAction = { type: "highlighter", points: [pt], ...baseProps };
        break;

      case "mosaic":
      case "blur": {
        if (this.mosaicMode === "brush") {
          this.activeAction = {
            type: this.currentTool,
            mode: "brush",
            points: [pt],
            width: Math.max(16, this.strokeWidth * 4),
          };
        } else {
          this.activeAction = {
            type: this.currentTool,
            mode: "rect",
            x: pt.x,
            y: pt.y,
            w: 0,
            h: 0,
          };
        }
        break;
      }

      case "step": {
        const num = this.getNextStepNumber();
        const radius = Math.max(12, Math.min(26, this.strokeWidth * 2.2 + 6));
        this.activeAction = {
          type: "step",
          x: pt.x,
          y: pt.y,
          number: num,
          radius,
          color: this.strokeColor,
        };
        break;
      }
    }
  }

  _onPointerMove(e) {
    if (!this.isDrawing || !this.activeAction) return;
    const pt = this._getCanvasPoint(e);

    switch (this.activeAction.type) {
      case "rect":
      case "ellipse":
        this.activeAction.w = pt.x - this.activeAction.x;
        this.activeAction.h = pt.y - this.activeAction.y;
        break;

      case "line":
      case "arrow":
        this.activeAction.x2 = pt.x;
        this.activeAction.y2 = pt.y;
        break;

      case "pen":
      case "highlighter":
        this.activeAction.points.push(pt);
        break;

      case "mosaic":
      case "blur":
        if (this.activeAction.mode === "brush") {
          this.activeAction.points.push(pt);
        } else {
          this.activeAction.w = pt.x - this.activeAction.x;
          this.activeAction.h = pt.y - this.activeAction.y;
        }
        break;

      case "step":
        this.activeAction.x = pt.x;
        this.activeAction.y = pt.y;
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
      if (["rect", "ellipse"].includes(this.activeAction.type)) {
        valid = Math.abs(this.activeAction.w) >= 3 && Math.abs(this.activeAction.h) >= 3;
      } else if (["line", "arrow"].includes(this.activeAction.type)) {
        const dx = this.activeAction.x2 - this.activeAction.x1;
        const dy = this.activeAction.y2 - this.activeAction.y1;
        valid = Math.hypot(dx, dy) >= 4;
      } else if (["pen", "highlighter"].includes(this.activeAction.type)) {
        valid = this.activeAction.points.length > 0;
      } else if (["mosaic", "blur"].includes(this.activeAction.type)) {
        if (this.activeAction.mode === "brush") {
          valid = this.activeAction.points.length > 0;
        } else {
          valid = Math.abs(this.activeAction.w) >= 3 && Math.abs(this.activeAction.h) >= 3;
        }
      } else if (this.activeAction.type === "step") {
        valid = true;
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

    const layers = {
      blurCanvas: this.blurCanvas,
      mosaicCanvas: this.mosaicCanvas,
    };

    for (const action of this.actions) {
      this._drawAction(this.ctx, action, layers);
    }
    if (this.activeAction) {
      this._drawAction(this.ctx, this.activeAction, layers);
    }
    this.ctx.restore();
  }

  _drawAction(ctx, action, layers = {}) {
    ctx.save();

    switch (action.type) {
      case "rect": {
        const x = Math.min(action.x, action.x + action.w);
        const y = Math.min(action.y, action.y + action.h);
        const w = Math.abs(action.w);
        const h = Math.abs(action.h);

        if (action.isFilled) {
          ctx.fillStyle = action.color;
          ctx.globalAlpha = 0.28;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1.0;
        }

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

        if (action.isFilled) {
          ctx.fillStyle = action.color;
          ctx.globalAlpha = 0.28;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }

        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.width;
        ctx.stroke();
        break;
      }

      case "line": {
        const { x1, y1, x2, y2, color, width } = action;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
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

        const shaftEndX = x2 - headlen * 0.5 * Math.cos(angle);
        const shaftEndY = y2 - headlen * 0.5 * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

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

      case "mosaic":
      case "blur": {
        const sourceLayer = action.type === "blur" ? layers.blurCanvas : layers.mosaicCanvas;

        if (action.mode === "brush") {
          if (!action.points || action.points.length === 0) break;
          if (sourceLayer) {
            try {
              const pat = ctx.createPattern(sourceLayer, "no-repeat");
              ctx.strokeStyle = pat;
              ctx.lineWidth = action.width || 24;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.beginPath();
              ctx.moveTo(action.points[0].x, action.points[0].y);
              for (let i = 1; i < action.points.length; i++) {
                ctx.lineTo(action.points[i].x, action.points[i].y);
              }
              ctx.stroke();
            } catch (_) {
              ctx.strokeStyle = "rgba(120, 120, 120, 0.75)";
              ctx.lineWidth = action.width || 24;
              ctx.stroke();
            }
          }
        } else {
          const x = Math.min(action.x, action.x + action.w);
          const y = Math.min(action.y, action.y + action.h);
          const w = Math.abs(action.w);
          const h = Math.abs(action.h);

          if (sourceLayer && w > 0 && h > 0) {
            try {
              ctx.drawImage(sourceLayer, x, y, w, h, x, y, w, h);
            } catch (_) {
              ctx.fillStyle = "rgba(120, 120, 120, 0.75)";
              ctx.fillRect(x, y, w, h);
            }
          } else {
            ctx.fillStyle = "rgba(120, 120, 120, 0.75)";
            ctx.fillRect(x, y, w, h);
          }
        }
        break;
      }

      case "text": {
        ctx.font = `bold ${action.fontSize || 18}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = "top";

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

      case "step": {
        const { x, y, number, radius, color } = action;
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 1.5;

        // Outer badge circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Subtle crisp white rim
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.stroke();

        // Inner step number
        const textColor = color === "#ffffff" || color === "#eab308" ? "#111" : "#fff";
        const fontSize = Math.round(radius * 1.15);
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = textColor;
        ctx.fillText(String(number), x, y + 0.5);
        ctx.restore();
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Export composite screenshot + annotations as high-DPI PNG.
   */
  exportComposite(imageElement, cropX, cropY, cropW, cropH) {
    const outCanvas = document.createElement("canvas");
    const outW = Math.round(cropW);
    const outH = Math.round(cropH);
    outCanvas.width = outW;
    outCanvas.height = outH;

    const outCtx = outCanvas.getContext("2d");
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
    } catch (_) {}

    const scale = outW / (this.width || 1);

    // Build high-res layers for export
    let outBlurCanvas = null;
    let outMosaicCanvas = null;

    if (this.actions.some((a) => a.type === "blur" || a.type === "mosaic")) {
      try {
        outBlurCanvas = document.createElement("canvas");
        outBlurCanvas.width = outW;
        outBlurCanvas.height = outH;
        const bCtx = outBlurCanvas.getContext("2d");
        bCtx.filter = `blur(${Math.round(10 * scale)}px)`;
        bCtx.drawImage(outCanvas, 0, 0);

        outMosaicCanvas = document.createElement("canvas");
        outMosaicCanvas.width = outW;
        outMosaicCanvas.height = outH;
        const mCtx = outMosaicCanvas.getContext("2d");
        mCtx.imageSmoothingEnabled = false;
        const block = Math.max(4, Math.round(10 * scale));
        const smW = Math.max(1, Math.floor(outW / block));
        const smH = Math.max(1, Math.floor(outH / block));
        const tCanvas = document.createElement("canvas");
        tCanvas.width = smW;
        tCanvas.height = smH;
        tCanvas.getContext("2d").drawImage(outCanvas, 0, 0, smW, smH);
        mCtx.drawImage(tCanvas, 0, 0, smW, smH, 0, 0, outW, outH);
      } catch (_) {}
    }

    outCtx.save();
    outCtx.scale(scale, scale);

    const exportLayers = {
      blurCanvas: outBlurCanvas,
      mosaicCanvas: outMosaicCanvas,
    };

    for (const action of this.actions) {
      this._drawAction(outCtx, action, exportLayers);
    }
    outCtx.restore();

    return outCanvas.toDataURL("image/png");
  }
}

window.Annotator = Annotator;

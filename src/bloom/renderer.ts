import type { KanjiNode, FilterState } from "../shared/types";
import { buildNebulaCanvas } from "./kde";

export type { KanjiNode, FilterState };

const NODE_RADIUS = 2.5;
const NODE_RADIUS_HOVER = 5;
const NODE_RADIUS_SELECTED = 6;
const WORLD_SIZE = 4000;
const PADDING = 200;

const LABEL_SCALE_START = 1.8;
const LABEL_SCALE_END = 3.5;

const COLOR_JOYO = "#c8d4ff";
const COLOR_JINMEI = "#ffd98e";
const COLOR_SELECTED = "#ffffff";
const COLOR_SEARCH = "#7fff7f";

// twinkling パラメータ
const TWINKLE_SPEED_MIN = 0.4;
const TWINKLE_SPEED_MAX = 1.2;

interface TwinkleState {
  phase: number;
  freq: number;
  sizePhase: number;
  sizeFreq: number;
}

export class BloomRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: KanjiNode[] = [];
  private filter: FilterState = { joyo: true, jinmei: true };

  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;

  private hoveredNode: KanjiNode | null = null;
  private selectedNode: KanjiNode | null = null;
  private searchNode: KanjiNode | null = null;

  // twinkling 状態（ノードごとにランダム）
  private twinkle: Map<KanjiNode, TwinkleState> = new Map();

  // ネビュラ（オフスクリーン canvas）
  private nebulaCanvas: HTMLCanvasElement | null = null;
  private readonly NEBULA_WORLD = 1024; // ネビュラを焼き込むワールド解像度

  private rafId: number | null = null;
  private startTime = performance.now();

  onSelect: ((node: KanjiNode | null) => void) = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.bindEvents();
    this.resize();
    window.addEventListener("resize", () => { this.resize(); });
  }

  load(nodes: KanjiNode[]) {
    this.nodes = nodes;

    // twinkling パラメータをランダムに生成
    this.twinkle.clear();
    for (const node of nodes) {
      this.twinkle.set(node, {
        phase:     Math.random() * Math.PI * 2,
        freq:      TWINKLE_SPEED_MIN + Math.random() * (TWINKLE_SPEED_MAX - TWINKLE_SPEED_MIN),
        sizePhase: Math.random() * Math.PI * 2,
        sizeFreq:  TWINKLE_SPEED_MIN * 0.5 + Math.random() * 0.3,
      });
    }

    // ネビュラを事前レンダリング
    this.nebulaCanvas = buildNebulaCanvas(
      nodes,
      this.NEBULA_WORLD,
      this.NEBULA_WORLD,
      this.NEBULA_WORLD * 0.04,  // bandwidth = world の 4%
    );

    this.fitView();
    this.startRenderLoop();
  }

  setFilter(filter: FilterState) {
    this.filter = filter;
  }

  search(kanji: string) {
    if (!kanji) { this.searchNode = null; return false; }
    const node = this.nodes.find((n) => n.k === kanji);
    if (!node) return false;
    this.searchNode = node;
    this.focusNode(node);
    return true;
  }

  clearSearch() { this.searchNode = null; }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private fitView() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const worldW = WORLD_SIZE + PADDING * 2;
    const worldH = WORLD_SIZE + PADDING * 2;
    this.scale = Math.min(w / worldW, h / worldH) * 0.9;
    this.offsetX = (w - worldW * this.scale) / 2;
    this.offsetY = (h - worldH * this.scale) / 2;
  }

  private focusNode(node: KanjiNode) {
    const wx = node.x * WORLD_SIZE + PADDING;
    const wy = node.y * WORLD_SIZE + PADDING;
    const targetScale = Math.max(this.scale, 2.5);
    this.scale = targetScale;
    this.offsetX = this.canvas.width / 2 - wx * this.scale;
    this.offsetY = this.canvas.height / 2 - wy * this.scale;
  }

  private screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.offsetX) / this.scale, (sy - this.offsetY) / this.scale];
  }

  private hitTest(sx: number, sy: number): KanjiNode | null {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const visualScreenR = Math.min(NODE_RADIUS_HOVER * Math.sqrt(this.scale), 18);
    const threshold = (visualScreenR + 20) / this.scale;
    let best: KanjiNode | null = null;
    let bestDist = threshold * threshold;
    for (const node of this.nodes) {
      if (!this.isVisible(node)) continue;
      const nx = node.x * WORLD_SIZE + PADDING;
      const ny = node.y * WORLD_SIZE + PADDING;
      const d2 = (nx - wx) ** 2 + (ny - wy) ** 2;
      if (d2 < bestDist) { bestDist = d2; best = node; }
    }
    return best;
  }

  private isVisible(node: KanjiNode): boolean {
    if (node.t === 0 && !this.filter.joyo) return false;
    if (node.t === 1 && !this.filter.jinmei) return false;
    return true;
  }

  private startRenderLoop() {
    const loop = () => {
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(loop);
  }

  private render() {
    const { ctx, canvas, scale, offsetX, offsetY } = this;
    const w = canvas.width;
    const h = canvas.height;
    const t = (performance.now() - this.startTime) / 1000;

    // 背景
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, w, h);

    // ── ネビュラ描画 ──
    if (this.nebulaCanvas) {
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // ネビュラ canvas はワールド座標 [0, NEBULA_WORLD] で作られているので、
      // WORLD_SIZE + PADDING*2 のワールドにフィットさせてオフセットを合わせる
      ctx.globalAlpha = 0.75;
      ctx.drawImage(
        this.nebulaCanvas,
        PADDING,                   // ワールド x 開始
        PADDING,                   // ワールド y 開始
        WORLD_SIZE,               // ワールド幅
        WORLD_SIZE,               // ワールド高さ
      );
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const margin = 60 / scale;
    const vxMin = -offsetX / scale - margin;
    const vyMin = -offsetY / scale - margin;
    const vxMax = (w - offsetX) / scale + margin;
    const vyMax = (h - offsetY) / scale + margin;

    const labelAlpha = Math.min(1, Math.max(0,
      (scale - LABEL_SCALE_START) / (LABEL_SCALE_END - LABEL_SCALE_START)
    ));

    const nodeScreenR     = Math.min(NODE_RADIUS          * Math.sqrt(scale), 10);
    const hoverScreenR    = Math.min(NODE_RADIUS_HOVER    * Math.sqrt(scale), 18);
    const selectedScreenR = Math.min(NODE_RADIUS_SELECTED * Math.sqrt(scale), 20);
    const fontScreenSize  = Math.min(13 * Math.sqrt(scale), 42);
    const specialFontScreenSize = Math.min(18 * Math.sqrt(scale), 56);

    // Pass 1: ドット（twinkling + shadowBlur bloom）
    for (const node of this.nodes) {
      if (!this.isVisible(node)) continue;
      const nx = node.x * WORLD_SIZE + PADDING;
      const ny = node.y * WORLD_SIZE + PADDING;
      if (nx < vxMin || nx > vxMax || ny < vyMin || ny > vyMax) continue;

      const tw = this.twinkle.get(node)!;
      const twAlpha  = 0.5 + 0.5 * Math.sin(t * tw.freq  + tw.phase);
      const twSize   = 1.0 + 0.3 * Math.sin(t * tw.sizeFreq + tw.sizePhase);

      const isSearch   = node === this.searchNode;
      const isSelected = node === this.selectedNode;
      const isHovered  = node === this.hoveredNode;

      let r: number;
      let color = node.t === 0 ? COLOR_JOYO : COLOR_JINMEI;
      let alpha: number;
      let bloomRadius: number;
      let bloomAlpha: number;

      if (isSearch) {
        r = selectedScreenR / scale; color = COLOR_SEARCH;
        alpha = 1; bloomRadius = r * 4; bloomAlpha = 0.35;
      } else if (isSelected) {
        r = selectedScreenR / scale; color = COLOR_SELECTED;
        alpha = 1; bloomRadius = r * 4; bloomAlpha = 0.35;
      } else if (isHovered) {
        r = hoverScreenR / scale;
        alpha = 1; bloomRadius = r * 3.5; bloomAlpha = 0.3;
      } else {
        r = (nodeScreenR / scale) * twSize;
        alpha = (0.4 + 0.6 * twAlpha) * (1 - labelAlpha);
        bloomRadius = r * 2.5; bloomAlpha = (0.12 + 0.08 * twAlpha) * (1 - labelAlpha);
      }

      // shadowBlur bloom（スクリーン座標系に合わせてスケール補正）
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur  = (isHovered || isSelected || isSearch) ? 20 / scale : 8 / scale;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // ソフトグロー（大き目の半透明円）
      ctx.globalAlpha = bloomAlpha;
      ctx.beginPath();
      ctx.arc(nx, ny, bloomRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pass 2: ラベル
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (labelAlpha > 0) {
      ctx.font = `${fontScreenSize / scale}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
      for (const node of this.nodes) {
        if (!this.isVisible(node)) continue;
        if (node === this.hoveredNode || node === this.selectedNode || node === this.searchNode) continue;
        const nx = node.x * WORLD_SIZE + PADDING;
        const ny = node.y * WORLD_SIZE + PADDING;
        if (nx < vxMin || nx > vxMax || ny < vyMin || ny > vyMax) continue;
        const tw = this.twinkle.get(node)!;
        const twAlpha = 0.5 + 0.5 * Math.sin(t * tw.freq + tw.phase);
        ctx.globalAlpha = labelAlpha * (0.5 + 0.5 * twAlpha);
        ctx.fillStyle = node.t === 0 ? COLOR_JOYO : COLOR_JINMEI;
        ctx.fillText(node.k, nx, ny);
      }
    }
    ctx.globalAlpha = 1;

    // Pass 3: 特殊ノード（ホバー・選択・検索）
    ctx.font = `bold ${specialFontScreenSize / scale}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
    ctx.textBaseline = "bottom";
    for (const node of [this.hoveredNode, this.selectedNode, this.searchNode]) {
      if (!node || !this.isVisible(node)) continue;
      const nx = node.x * WORLD_SIZE + PADDING;
      const ny = node.y * WORLD_SIZE + PADDING;
      const color = node === this.searchNode ? COLOR_SEARCH : "#ffffff";
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 / scale;
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillText(node.k, nx, ny - hoverScreenR / scale - 2 / scale);
      ctx.restore();
    }

    ctx.restore();
  }

  private bindEvents() {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup",   this.onMouseUp);
    this.canvas.addEventListener("mouseleave",this.onMouseLeave);
    this.canvas.addEventListener("wheel",     this.onWheel, { passive: false });
    this.canvas.addEventListener("click",     this.onClick);
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove",  this.onTouchMove,  { passive: false });
    this.canvas.addEventListener("touchend",   this.onTouchEnd);
  }

  private onMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.dragStartX = e.clientX; this.dragStartY = e.clientY;
    this.dragStartOffsetX = this.offsetX; this.dragStartOffsetY = this.offsetY;
    this.canvas.classList.add("dragging");
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      this.offsetX = this.dragStartOffsetX + (e.clientX - this.dragStartX);
      this.offsetY = this.dragStartOffsetY + (e.clientY - this.dragStartY);
      return;
    }
    this.hoveredNode = this.hitTest(e.clientX, e.clientY);
  };
  private onMouseUp    = () => { this.isDragging = false; this.canvas.classList.remove("dragging"); };
  private onMouseLeave = () => { this.isDragging = false; this.hoveredNode = null; this.canvas.classList.remove("dragging"); };

  private onClick = (e: MouseEvent) => {
    const moved = Math.abs(e.clientX - this.dragStartX) + Math.abs(e.clientY - this.dragStartY);
    if (moved > 4) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    this.selectedNode = hit;
    this.onSelect(hit);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    this.offsetX = e.clientX - (e.clientX - this.offsetX) * factor;
    this.offsetY = e.clientY - (e.clientY - this.offsetY) * factor;
    this.scale = Math.max(0.1, Math.min(20, this.scale * factor));
  };

  private lastTouchDist = 0;
  private lastTouchMidX = 0;
  private lastTouchMidY = 0;

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const [t0, t1] = [e.touches[0], e.touches[1]];
      this.lastTouchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      this.lastTouchMidX = (t0.clientX + t1.clientX) / 2;
      this.lastTouchMidY = (t0.clientY + t1.clientY) / 2;
    } else if (e.touches.length === 1) {
      this.dragStartX = e.touches[0].clientX; this.dragStartY = e.touches[0].clientY;
      this.dragStartOffsetX = this.offsetX; this.dragStartOffsetY = this.offsetY;
      this.isDragging = true;
    }
  };
  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const factor = dist / this.lastTouchDist;
      this.offsetX = midX - (this.lastTouchMidX - this.offsetX) * factor;
      this.offsetY = midY - (this.lastTouchMidY - this.offsetY) * factor;
      this.scale = Math.max(0.1, Math.min(20, this.scale * factor));
      this.lastTouchDist = dist; this.lastTouchMidX = midX; this.lastTouchMidY = midY;
    } else if (e.touches.length === 1 && this.isDragging) {
      this.offsetX = this.dragStartOffsetX + (e.touches[0].clientX - this.dragStartX);
      this.offsetY = this.dragStartOffsetY + (e.touches[0].clientY - this.dragStartY);
    }
  };
  private onTouchEnd = () => { this.isDragging = false; };
}

// A flat surface in the VR room: a canvas drawn in Wakefield's type and color,
// mapped onto a plane, with hit regions you can point at and pinch.
import { COLOR, FONT } from "../design";

// three.js loads at runtime from a CDN (see room.ts), so it is untyped here.
export type Three = any;

export type Region = { id: string; x: number; y: number; w: number; h: number; onSelect: () => void };

type TextOpts = {
  size: number;
  color?: string;
  read?: boolean;
  weight?: number;
  upper?: boolean;
  tracking?: number;
  align?: CanvasTextAlign;
};

export class Panel {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: Three;
  readonly mesh: Three;
  regions: Region[] = [];
  hover = "";
  dirty = true;

  constructor(
    T: Three,
    /** Size in meters. */
    readonly width: number,
    readonly height: number,
    /** Canvas pixels per meter. */
    pxPerMeter: number,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(width * pxPerMeter);
    this.canvas.height = Math.round(height * pxPerMeter);
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: this.texture, transparent: true }));
    this.mesh.userData.panel = this;
  }

  get w() {
    return this.canvas.width;
  }
  get h() {
    return this.canvas.height;
  }

  /** Start a fresh frame: clear, forget old hit regions. */
  begin(fill: string = COLOR.canvas) {
    this.regions = [];
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  end() {
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  /** The region under a uv coordinate from a raycast hit. */
  hit(uv: { x: number; y: number }): Region | undefined {
    const x = uv.x * this.w;
    const y = (1 - uv.y) * this.h;
    return this.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  setHover(id: string) {
    if (id === this.hover) return;
    this.hover = id;
    this.dirty = true;
  }

  font(o: TextOpts) {
    const { ctx } = this;
    ctx.font = `${o.weight ?? 400} ${o.size}px ${o.read ? FONT.read : FONT.mono}`;
    ctx.fillStyle = o.color ?? COLOR.ink;
    ctx.textAlign = o.align ?? "left";
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(o.tracking ?? 0) * o.size}px`;
  }

  text(str: string, x: number, y: number, o: TextOpts) {
    this.font(o);
    this.ctx.fillText(o.upper ? str.toUpperCase() : str, x, y);
  }

  /** Word-wrap into lines no wider than maxW. */
  wrap(str: string, maxW: number, o: TextOpts): string[] {
    this.font(o);
    const out: string[] = [];
    for (const para of str.split(/\n+/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(next).width > maxW && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      if (line) out.push(line);
    }
    return out;
  }

  /** Draw wrapped text; returns the y after the last line. Caps at maxLines with an ellipsis. */
  para(str: string, x: number, y: number, maxW: number, o: TextOpts & { lineHeight?: number; maxLines?: number }): number {
    let lines = this.wrap(str, maxW, o);
    if (o.maxLines && lines.length > o.maxLines) {
      lines = lines.slice(0, o.maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "…");
    }
    const lh = o.lineHeight ?? o.size * 1.4;
    lines.forEach((l, i) => this.text(l, x, y + i * lh, o));
    return y + lines.length * lh;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string = COLOR.line, width = 2) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  rect(x: number, y: number, w: number, h: number, color: string, width = 2, dash: number[] = []) {
    const { ctx } = this;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
    ctx.setLineDash([]);
  }

  fill(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  /** The wf-frame motif: hairline box with signal corner ticks. */
  frame(x: number, y: number, w: number, h: number, tick = 28) {
    this.rect(x, y, w, h, COLOR.line, 2);
    const c = COLOR.signal;
    this.line(x, y + 1, x + tick, y + 1, c, 3);
    this.line(x + 1, y, x + 1, y + tick, c, 3);
    this.line(x + w - tick, y + h - 1, x + w, y + h - 1, c, 3);
    this.line(x + w - 1, y + h - tick, x + w - 1, y + h, c, 3);
  }

  /** A segmented meter, like the app's VigorBar. */
  meter(x: number, y: number, w: number, h: number, value: number, max: number, color: string) {
    const gap = 6;
    const seg = Math.max(1, max);
    const sw = (w - gap * (seg - 1)) / seg;
    for (let i = 0; i < seg; i++) this.fill(x + i * (sw + gap), y, sw, h, i < value ? color : COLOR.line);
  }

  /** A pointable button. Hover inverts it to the signal color, like :active on the phone. */
  button(id: string, x: number, y: number, w: number, h: number, draw: (hot: boolean) => void, onSelect: () => void, enabled = true) {
    const hot = enabled && this.hover === id;
    if (hot) this.fill(x, y, w, h, COLOR.signal);
    this.rect(x, y, w, h, hot ? COLOR.signal : enabled ? COLOR.line : COLOR.surface, 2);
    this.ctx.globalAlpha = enabled ? 1 : 0.4;
    draw(hot);
    this.ctx.globalAlpha = 1;
    if (enabled) this.regions.push({ id, x, y, w, h, onSelect });
  }
}

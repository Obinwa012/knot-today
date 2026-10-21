import * as Phaser from 'phaser';
import { Puzzle } from '../logic/puzzle.ts';
import { distToPath, samplePath } from '../logic/geometry.ts';
import { optimalOrders } from '../logic/solver.ts';
import type { CrossingDef, LevelDef, Pattern, Point, StrandDef } from '../logic/types.ts';
import { level1 } from '../levels/level1.ts';

const W = 720;
const H = 1280;
const BG = 0xf3ebdd;
const INK = 0x3b3029;
const STRAND_W = 20;
const GAP = 7; // background showing either side of the top strand at a crossing
const LOCAL_R = 36; // how much of the top strand is redrawn over each crossing
const CROSS_HIT = 42;
const STRAND_HIT = 24;
const HANDLE_R = 22;
const HOLD_MS = 260;

interface Mark {
  x: number;
  y: number;
  /** Unit tangent at the mark. */
  tx: number;
  ty: number;
}

interface StrandView {
  def: StrandDef;
  path: Point[];
  marks: Mark[];
  end: Point;
  /** 0..1 while sliding out; 1 = gone. */
  slide: number;
  shake: number;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function shade(color: number, f: number): number {
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

/** Evenly spaced points along a path, for drawing the pattern cue. */
function marksAlong(path: Point[], spacing: number, offset: number): Mark[] {
  const out: Mark[] = [];
  let next = offset;
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    while (next <= walked + len) {
      const t = (next - walked) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len });
      next += spacing;
    }
    walked += len;
  }
  return out;
}

export class PlayScene extends Phaser.Scene {
  private level: LevelDef = level1;
  private puzzle!: Puzzle;
  private par = 0;
  private views: StrandView[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private flipsText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private winLayer?: Phaser.GameObjects.Container;
  private labels = new Map<string, Phaser.GameObjects.Text>();

  /** Per-crossing animation clocks, 0..1. */
  private flipPulse = new Map<string, number>();
  private blockedFlash = new Map<string, number>();
  private focus: string | null = null;
  private press: { strand: string; timer: Phaser.Time.TimerEvent } | null = null;
  private taps = 0;
  private misses = 0;

  constructor() {
    super('play');
  }

  create(): void {
    this.puzzle = new Puzzle(this.level);
    this.par = optimalOrders(this.level).cost;
    this.views = this.level.strands.map((def, i) => {
      const path = samplePath(def.points);
      return { def, path, marks: marksAlong(path, 30, 14 + i * 4), end: path[path.length - 1], slide: 0, shake: 0 };
    });

    this.cameras.main.setBackgroundColor(BG);
    this.g = this.add.graphics();

    this.add.text(36, 40, 'Knot Today', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#3b3029' }).setResolution(2);
    this.add.text(36, 92, `Level 1 · ${this.level.name}`, { fontFamily: FONT, fontSize: '24px', color: '#7a6a5c' }).setResolution(2);
    this.flipsText = this.add
      .text(W - 36, 46, '', { fontFamily: FONT, fontSize: '30px', color: '#3b3029', align: 'right' })
      .setOrigin(1, 0)
      .setResolution(2);
    this.hintText = this.add
      .text(W / 2, 150, 'Tap a crossing to flip it. When a strand glows,\ntap it to pull it free.', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#7a6a5c',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setResolution(2);

    for (const v of this.views) {
      const t = this.add
        .text(v.end.x, v.end.y, v.def.id, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5)
        .setResolution(2);
      this.labels.set(v.def.id, t);
    }

    this.makeButton(W / 2, H - 80, 'Start over', () => this.restart());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p.x, p.y));
    this.input.on('pointerup', () => this.onUp());
    this.updateHud();
  }

  // ---------------------------------------------------------------- input

  private crossingAt(x: number, y: number): CrossingDef | undefined {
    let best: CrossingDef | undefined;
    let bestD = CROSS_HIT;
    for (const c of this.level.crossings) {
      if (!this.puzzle.isLive(c.id)) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  private strandAt(x: number, y: number): StrandView | undefined {
    let best: StrandView | undefined;
    let bestD = Infinity;
    for (const v of this.views) {
      if (this.puzzle.isFreed(v.def.id)) continue;
      const d = Math.min(distToPath({ x, y }, v.path), Math.hypot(v.end.x - x, v.end.y - y) - HANDLE_R + STRAND_HIT / 2);
      if (d < STRAND_HIT && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  private onDown(x: number, y: number): void {
    if (this.winLayer) return;
    this.taps++;
    const c = this.crossingAt(x, y);
    if (c) {
      this.puzzle.flip(c.id);
      this.flipPulse.set(c.id, 0);
      this.blockedFlash.delete(c.id);
      this.updateHud();
      return;
    }
    const v = this.strandAt(x, y);
    if (!v) {
      this.misses++;
      return;
    }
    // Hold to trace a strand; a quick tap tries to pull it free.
    const timer = this.time.delayedCall(HOLD_MS, () => (this.focus = v.def.id));
    this.press = { strand: v.def.id, timer };
  }

  private onUp(): void {
    if (!this.press) return;
    const { strand, timer } = this.press;
    const wasHold = this.focus !== null;
    timer.remove(false);
    this.press = null;
    this.focus = null;
    if (wasHold) return;
    this.tryFree(strand);
  }

  private tryFree(id: string): void {
    const v = this.views.find((s) => s.def.id === id)!;
    if (!this.puzzle.free(id)) {
      // Show what is holding it down instead of explaining the rule.
      for (const c of this.puzzle.blockersOf(id)) this.blockedFlash.set(c, 1);
      this.tweens.addCounter({
        from: 1,
        to: 0,
        duration: 320,
        onUpdate: (tw) => (v.shake = tw.getValue() ?? 0),
      });
      return;
    }
    this.hintText.setVisible(false);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 700,
      ease: 'Cubic.easeIn',
      onUpdate: (tw) => (v.slide = tw.getValue() ?? 0),
      onComplete: () => {
        v.slide = 1;
        if (this.puzzle.solved) this.showWin();
      },
    });
    this.labels.get(id)!.setVisible(false);
    this.updateHud();
  }

  // ---------------------------------------------------------------- hud

  private updateHud(): void {
    this.flipsText.setText(`Flips ${this.puzzle.flips}\nPar ${this.par}`);
  }

  private makeButton(x: number, y: number, label: string, onTap: () => void): Phaser.GameObjects.Container {
    const bg = this.add.graphics();
    bg.fillStyle(INK, 1).fillRoundedRect(-120, -32, 240, 64, 32);
    const text = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '26px', color: '#f3ebdd' }).setOrigin(0.5).setResolution(2);
    const box = this.add.container(x, y, [bg, text]).setSize(240, 64).setInteractive({ useHandCursor: true });
    box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      onTap();
    });
    return box;
  }

  private showWin(): void {
    const flips = this.puzzle.flips;
    const verdict = flips === this.par ? 'Perfect untangle!' : flips <= this.par + 2 ? 'Nicely done.' : 'Untangled!';
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.35).fillRect(0, 0, W, H);
    panel.fillStyle(0xfffaf2, 1).fillRoundedRect(80, 420, W - 160, 420, 28);
    const t = (y: number, s: string, size: number, color = '#3b3029') =>
      this.add.text(W / 2, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5).setResolution(2);
    const missRate = this.taps ? Math.round((100 * this.misses) / this.taps) : 0;
    this.winLayer = this.add.container(0, 0, [
      panel,
      t(500, 'All the yarn is free', 38),
      t(565, verdict, 28, '#7a6a5c'),
      t(630, `${flips} flips · par ${this.par}`, 30),
      t(680, `Freed: ${this.puzzle.freedOrder.join(' → ')}`, 24, '#7a6a5c'),
      t(720, `Taps ${this.taps} · missed ${this.misses} (${missRate}%)`, 20, '#a3968a'),
    ]);
    this.winLayer.add(this.makeButton(W / 2, 790, 'Play again', () => this.restart()));
  }

  private restart(): void {
    this.winLayer?.destroy();
    this.winLayer = undefined;
    this.puzzle.reset();
    this.flipPulse.clear();
    this.blockedFlash.clear();
    this.taps = 0;
    this.misses = 0;
    for (const v of this.views) {
      v.slide = 0;
      v.shake = 0;
      this.labels.get(v.def.id)!.setVisible(true);
    }
    this.hintText.setVisible(true);
    this.updateHud();
  }

  // ---------------------------------------------------------------- drawing

  update(_time: number, delta: number): void {
    for (const [id, t] of this.flipPulse) {
      const n = t + delta / 200;
      if (n >= 1) this.flipPulse.delete(id);
      else this.flipPulse.set(id, n);
    }
    for (const [id, t] of this.blockedFlash) {
      const n = t - delta / 900;
      if (n <= 0) this.blockedFlash.delete(id);
      else this.blockedFlash.set(id, n);
    }
    this.draw();
  }

  private offsetOf(v: StrandView): Point {
    return { x: Math.sin(v.shake * Math.PI * 6) * 8 * v.shake, y: v.slide * (H + 200) };
  }

  private alphaOf(v: StrandView): number {
    if (this.focus && this.focus !== v.def.id) return 0.18;
    return 1;
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const now = this.time.now;
    const live = this.views.filter((v) => !this.puzzle.isFreed(v.def.id));
    const sliding = this.views.filter((v) => this.puzzle.isFreed(v.def.id) && v.slide < 1);

    // Glow under strands that are ready to pull.
    for (const v of live) {
      if (!this.puzzle.canFree(v.def.id)) continue;
      const pulse = 0.35 + 0.25 * Math.sin(now / 220);
      this.strokePath(g, v.path, this.offsetOf(v), STRAND_W + 22, 0xfff3b0, pulse * this.alphaOf(v));
    }

    for (const v of live) this.drawStrand(g, v, v.path, v.marks, this.offsetOf(v), this.alphaOf(v), false);

    // Re-draw the top strand over each live crossing with a gap of
    // background, so the strand underneath visibly passes below it.
    for (const c of this.level.crossings) {
      if (!this.puzzle.isLive(c.id)) continue;
      const v = this.views.find((s) => s.def.id === this.puzzle.topOf(c.id))!;
      const near = (p: Point) => Math.hypot(p.x - c.x, p.y - c.y) <= LOCAL_R;
      const local = v.path.filter(near);
      const off = this.offsetOf(v);
      this.strokeOpen(g, local, off, STRAND_W + 2 * GAP + 4, BG, 1);
      this.drawStrand(g, v, local, v.marks.filter(near), off, this.alphaOf(v), true);
    }

    // Tap affordance and feedback rings.
    for (const c of this.level.crossings) {
      if (!this.puzzle.isLive(c.id)) continue;
      const fade = this.focus ? 0.3 : 1;
      g.lineStyle(2, INK, 0.16 * fade).strokeCircle(c.x, c.y, 30);
      const p = this.flipPulse.get(c.id);
      if (p !== undefined) g.lineStyle(4, INK, 0.5 * (1 - p)).strokeCircle(c.x, c.y, 26 + 18 * p);
      const b = this.blockedFlash.get(c.id);
      if (b !== undefined) g.lineStyle(5, 0xd1453b, Math.min(1, b * 1.5)).strokeCircle(c.x, c.y, 31);
    }

    for (const v of sliding) this.drawStrand(g, v, v.path, v.marks, this.offsetOf(v), 1 - v.slide * 0.4, false);

    // Pull handles at the bottom of each strand.
    for (const v of this.views) {
      if (v.slide >= 1) continue;
      const off = this.offsetOf(v);
      const ready = !this.puzzle.isFreed(v.def.id) && this.puzzle.canFree(v.def.id);
      const bob = ready ? Math.abs(Math.sin(now / 180)) * 6 : 0;
      const x = v.end.x + off.x, y = v.end.y + off.y + bob;
      const a = this.alphaOf(v);
      g.fillStyle(INK, a).fillCircle(x, y, HANDLE_R + 3);
      g.fillStyle(shade(v.def.color, 0.8), a).fillCircle(x, y, HANDLE_R);
      this.labels.get(v.def.id)!.setPosition(x, y).setAlpha(a);
    }
  }

  private strokePath(g: Phaser.GameObjects.Graphics, pts: Point[], off: Point, width: number, color: number, alpha: number): void {
    if (pts.length < 2) return;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(pts[0].x + off.x, pts[0].y + off.y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + off.x, pts[i].y + off.y);
    g.strokePath();
    // Round the joints and ends so thick lines don't show notches.
    g.fillStyle(color, alpha);
    for (let i = 0; i < pts.length; i += 3) g.fillCircle(pts[i].x + off.x, pts[i].y + off.y, width / 2);
    const last = pts[pts.length - 1];
    g.fillCircle(last.x + off.x, last.y + off.y, width / 2);
  }

  private drawStrand(
    g: Phaser.GameObjects.Graphics,
    v: StrandView,
    pts: Point[],
    marks: Mark[],
    off: Point,
    alpha: number,
    isLocal: boolean,
  ): void {
    // A local piece must not round its ends, or it would bulge past the gap.
    if (isLocal) {
      this.strokeOpen(g, pts, off, STRAND_W + 4, INK, alpha);
      this.strokeOpen(g, pts, off, STRAND_W, v.def.color, alpha);
    } else {
      this.strokePath(g, pts, off, STRAND_W + 4, INK, alpha);
      this.strokePath(g, pts, off, STRAND_W, v.def.color, alpha);
    }
    this.drawPattern(g, v.def.pattern, v.def.color, marks, off, alpha);
  }

  private strokeOpen(g: Phaser.GameObjects.Graphics, pts: Point[], off: Point, width: number, color: number, alpha: number): void {
    if (pts.length < 2) return;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(pts[0].x + off.x, pts[0].y + off.y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + off.x, pts[i].y + off.y);
    g.strokePath();
    g.fillStyle(color, alpha);
    for (let i = 1; i < pts.length - 1; i++) g.fillCircle(pts[i].x + off.x, pts[i].y + off.y, width / 2 - 0.5);
  }

  private drawPattern(g: Phaser.GameObjects.Graphics, pattern: Pattern, color: number, marks: Mark[], off: Point, alpha: number): void {
    const dark = shade(color, 0.45);
    for (const m of marks) {
      const x = m.x + off.x, y = m.y + off.y;
      const nx = -m.ty, ny = m.tx;
      switch (pattern) {
        case 'solid':
          break;
        case 'dots':
          g.fillStyle(dark, alpha).fillCircle(x, y, 4);
          break;
        case 'dashes':
          g.lineStyle(4, dark, alpha).lineBetween(x - m.tx * 7, y - m.ty * 7, x + m.tx * 7, y + m.ty * 7);
          break;
        case 'stripes':
          g.lineStyle(4, dark, alpha).lineBetween(x - nx * 8 - m.tx * 4, y - ny * 8 - m.ty * 4, x + nx * 8 + m.tx * 4, y + ny * 8 + m.ty * 4);
          break;
        case 'rings':
          g.lineStyle(3, dark, alpha).strokeCircle(x, y, 5);
          break;
      }
    }
  }
}

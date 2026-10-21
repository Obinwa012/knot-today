import * as Phaser from 'phaser';
import { Puzzle } from '../logic/puzzle.ts';
import { distToPath, samplePath } from '../logic/geometry.ts';
import { Engine } from '../logic/search.ts';
import type { CrossingDef, LevelDef, Pattern, Point, StrandDef } from '../logic/types.ts';
import { LEVELS } from '../levels/index.ts';

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
const BEAD = 0xb8862b;

const parCache = new Map<string, number>();
function parOf(level: LevelDef): number {
  if (!parCache.has(level.id)) parCache.set(level.id, new Engine(level).solve().flips);
  return parCache.get(level.id)!;
}
const FIRST_BEAD_LEVEL = LEVELS.findIndex((l) => l.crossings.some((c) => c.bead));

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
  private index = 0;
  private level!: LevelDef;
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
  private budgetFlash = 0;
  private focus: string | null = null;
  private press: { strand: string; timer: Phaser.Time.TimerEvent } | null = null;
  private taps = 0;
  private misses = 0;

  constructor() {
    super('play');
  }

  /** Runs on every (re)start, so per-attempt state is reset here. */
  init(data: { index?: number }): void {
    this.index = Math.max(0, Math.min(LEVELS.length - 1, data.index ?? 0));
    this.level = LEVELS[this.index];
    this.winLayer = undefined;
    this.labels = new Map();
    this.flipPulse = new Map();
    this.blockedFlash = new Map();
    this.budgetFlash = 0;
    this.focus = null;
    this.press = null;
    this.taps = 0;
    this.misses = 0;
  }

  create(): void {
    this.puzzle = new Puzzle(this.level);
    this.par = parOf(this.level);
    this.views = this.level.strands.map((def, i) => {
      const path = samplePath(def.points);
      return { def, path, marks: marksAlong(path, 30, 14 + i * 4), end: path[path.length - 1], slide: 0, shake: 0 };
    });

    this.cameras.main.setBackgroundColor(BG);
    this.g = this.add.graphics();

    this.add.text(36, 40, 'Knot Today', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#3b3029' }).setResolution(2);
    this.add.text(36, 92, `Level ${this.index + 1} of ${LEVELS.length} · ${this.level.name}`, { fontFamily: FONT, fontSize: '24px', color: '#7a6a5c' }).setResolution(2);
    this.flipsText = this.add
      .text(W - 36, 46, '', { fontFamily: FONT, fontSize: '30px', color: '#3b3029', align: 'right' })
      .setOrigin(1, 0)
      .setResolution(2);
    const hint =
      this.index === 0
        ? 'Tap a crossing to flip it. When a strand glows,\ntap it to pull it free.'
        : this.index === FIRST_BEAD_LEVEL
          ? 'Gold thread ties two crossings to one bead.\nTap either one and both flip, for one flip.'
          : '';
    this.hintText = this.add
      .text(W / 2, 150, hint, {
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
    if (this.index > 0) this.makeButton(90, H - 80, '‹', () => this.goTo(this.index - 1), 84);
    if (this.index < LEVELS.length - 1) this.makeButton(W - 90, H - 80, '›', () => this.goTo(this.index + 1), 84);

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
      const group = this.puzzle.flipGroup(c.id);
      if (!this.puzzle.flip(c.id)) {
        this.budgetFlash = 1; // out of flips
        return;
      }
      for (const id of group) {
        this.flipPulse.set(id, 0);
        this.blockedFlash.delete(id);
      }
      this.updateHud();
      this.checkFailed();
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
        else this.checkFailed();
      },
    });
    this.labels.get(id)!.setVisible(false);
    this.updateHud();
  }

  // ---------------------------------------------------------------- hud

  private updateHud(): void {
    this.flipsText.setText(`Flips ${this.puzzle.flips} / ${this.level.budget}\nPar ${this.par}`);
  }

  private checkFailed(): void {
    // A short beat before the result, and only if nothing changed meanwhile.
    if (this.puzzle.failed) this.time.delayedCall(600, () => this.puzzle.failed && !this.winLayer && this.showFail());
  }

  private makeButton(x: number, y: number, label: string, onTap: () => void, width = 240): Phaser.GameObjects.Container {
    const bg = this.add.graphics();
    bg.fillStyle(INK, 1).fillRoundedRect(-width / 2, -32, width, 64, 32);
    const size = label.length === 1 ? '40px' : '26px';
    const text = this.add.text(0, label.length === 1 ? -3 : 0, label, { fontFamily: FONT, fontSize: size, color: '#f3ebdd' }).setOrigin(0.5).setResolution(2);
    const box = this.add.container(x, y, [bg, text]).setSize(width, 64).setInteractive({ useHandCursor: true });
    box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      onTap();
    });
    return box;
  }

  private showWin(): void {
    if (this.winLayer) return; // several strands can finish sliding at once
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
    const last = this.index === LEVELS.length - 1;
    if (last) {
      this.winLayer.add(t(380, 'The whole shop is untangled!', 30, '#fffaf2'));
      this.winLayer.add(this.makeButton(W / 2, 790, 'Play again', () => this.restart()));
    } else {
      this.winLayer.add(this.makeButton(W / 2 - 130, 790, 'Replay', () => this.restart()));
      this.winLayer.add(this.makeButton(W / 2 + 130, 790, 'Next level', () => this.goTo(this.index + 1)));
    }
  }

  private showFail(): void {
    if (this.winLayer) return;
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.35).fillRect(0, 0, W, H);
    panel.fillStyle(0xfffaf2, 1).fillRoundedRect(80, 460, W - 160, 340, 28);
    const t = (y: number, s: string, size: number, color = '#3b3029') =>
      this.add.text(W / 2, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5).setResolution(2);
    const left = this.level.strands.length - this.puzzle.freedOrder.length;
    this.winLayer = this.add.container(0, 0, [
      panel,
      t(535, 'Out of flips', 38),
      t(595, `${left} strand${left === 1 ? '' : 's'} still tangled. Biscuit looks pleased.`, 24, '#7a6a5c'),
      t(640, `Par is ${this.par}. Retrying is always free.`, 22, '#a3968a'),
    ]);
    this.winLayer.add(this.makeButton(W / 2, 730, 'Try again', () => this.restart()));
  }

  private restart(): void {
    this.goTo(this.index);
  }

  private goTo(index: number): void {
    this.scene.restart({ index });
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
    this.budgetFlash = Math.max(0, this.budgetFlash - delta / 700);
    this.flipsText.setColor(this.budgetFlash > 0 ? '#d1453b' : '#3b3029');
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

    // Twin Beads: a gold thread between the crossings one bead flips.
    const fade = this.focus ? 0.3 : 1;
    const drawnBeads = new Set<string>();
    for (const c of this.level.crossings) {
      if (!c.bead || drawnBeads.has(c.bead)) continue;
      drawnBeads.add(c.bead);
      const pts = this.level.crossings.filter((k) => k.bead === c.bead && this.puzzle.isLive(k.id));
      if (pts.length < 2) continue; // with one crossing left, a bead is just a crossing
      g.lineStyle(5, BEAD, 0.75 * fade).lineBetween(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      g.fillStyle(INK, fade).fillCircle(mx, my, 11);
      g.fillStyle(BEAD, fade).fillCircle(mx, my, 9);
    }

    // Tap affordance and feedback rings.
    for (const c of this.level.crossings) {
      if (!this.puzzle.isLive(c.id)) continue;
      const beaded = this.puzzle.flipGroup(c.id).length > 1;
      if (beaded) g.lineStyle(5, BEAD, 0.9 * fade).strokeCircle(c.x, c.y, 30);
      else g.lineStyle(2, INK, 0.16 * fade).strokeCircle(c.x, c.y, 30);
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
        case 'squares':
          g.fillStyle(dark, alpha).fillRect(x - 4, y - 4, 8, 8);
          break;
      }
    }
  }
}

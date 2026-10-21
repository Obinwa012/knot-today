import type { LevelDef } from './types.ts';

/**
 * A compact copy of the rules over bitmasks, fast enough to search every
 * reachable board. Bit i of `tops` = crossing i has strand a on top; bit s of
 * `freed` = strand s is gone.
 */
export interface Board {
  tops: number;
  freed: number;
}

export type Move = { flip: number } | { free: number };

export class Engine {
  readonly n: number;
  readonly strandIds: string[];
  private ca: number[];
  private cb: number[];
  /** For each crossing, the mask of crossings a tap on it flips (bead partners included). */
  private groups: number[];
  readonly start: Board;
  readonly level: LevelDef;

  constructor(level: LevelDef) {
    this.level = level;
    this.strandIds = level.strands.map((s) => s.id);
    const idx = new Map(this.strandIds.map((s, i) => [s, i]));
    const cs = level.crossings;
    this.n = cs.length;
    this.ca = cs.map((c) => idx.get(c.a)!);
    this.cb = cs.map((c) => idx.get(c.b)!);
    this.groups = cs.map((c, i) =>
      c.bead ? cs.reduce((m, k, j) => (k.bead === c.bead ? m | (1 << j) : m), 0) : 1 << i,
    );
    let tops = 0;
    cs.forEach((c, i) => {
      if (c.top === c.a) tops |= 1 << i;
    });
    this.start = { tops, freed: 0 };
  }

  live(b: Board, i: number): boolean {
    return !(b.freed & (1 << this.ca[i])) && !(b.freed & (1 << this.cb[i]));
  }

  blockers(b: Board, s: number): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.live(b, i)) continue;
      const aTop = (b.tops & (1 << i)) !== 0;
      if ((this.ca[i] === s && !aTop) || (this.cb[i] === s && aTop)) k++;
    }
    return k;
  }

  /** Is crossing i live with strand s underneath? */
  isBlocking(b: Board, i: number, s: number): boolean {
    if (!this.live(b, i)) return false;
    const aTop = (b.tops & (1 << i)) !== 0;
    return (this.ca[i] === s && !aTop) || (this.cb[i] === s && aTop);
  }

  remaining(b: Board): number[] {
    return this.strandIds.map((_, s) => s).filter((s) => !(b.freed & (1 << s)));
  }

  solved(b: Board): boolean {
    return b.freed === (1 << this.strandIds.length) - 1;
  }

  /** Same board key for boards that differ only on dead crossings. */
  key(b: Board): number {
    let t = b.tops;
    for (let i = 0; i < this.n; i++) if (!this.live(b, i)) t &= ~(1 << i);
    return b.freed * (1 << this.n) + t;
  }

  /** Distinct taps available: one per distinct live flip group. */
  taps(b: Board): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) {
      if (!this.live(b, i)) continue;
      const g = this.liveGroup(b, i);
      if (!seen.has(g)) {
        seen.add(g);
        out.push(i);
      }
    }
    return out;
  }

  private liveGroup(b: Board, i: number): number {
    let g = this.groups[i];
    for (let j = 0; j < this.n; j++) if (g & (1 << j) && !this.live(b, j)) g &= ~(1 << j);
    return g;
  }

  flip(b: Board, i: number): Board {
    return { tops: b.tops ^ this.liveGroup(b, i), freed: b.freed };
  }

  /** Frees every strand that is free right now, repeatedly. Never a mistake (see tests). */
  freeAll(b: Board): Board {
    let cur = b;
    for (let again = true; again; ) {
      again = false;
      for (const s of this.remaining(cur)) {
        if (this.blockers(cur, s) === 0) {
          cur = { tops: cur.tops, freed: cur.freed | (1 << s) };
          again = true;
        }
      }
    }
    return cur;
  }

  /** Fewest flips to finish from b, and one shortest list of taps (crossing indexes). */
  solve(from: Board = this.start): { flips: number; taps: number[] } {
    const start = this.freeAll(from);
    const prev = new Map<number, { from: number; tap: number } | null>([[this.key(start), null]]);
    let frontier: Board[] = [start];
    for (let d = 0; frontier.length; d++) {
      const next: Board[] = [];
      for (const b of frontier) {
        if (this.solved(b)) {
          const taps: number[] = [];
          for (let k = this.key(b), p = prev.get(k); p; k = p.from, p = prev.get(k)) taps.unshift(p.tap);
          return { flips: d, taps };
        }
        for (const i of this.taps(b)) {
          const nb = this.freeAll(this.flip(b, i));
          const k = this.key(nb);
          if (prev.has(k)) continue;
          prev.set(k, { from: this.key(b), tap: i });
          next.push(nb);
        }
      }
      frontier = next;
    }
    throw new Error('level cannot be solved');
  }
}

/**
 * Same answer as Engine.solve but with pulling a strand free as an optional
 * move rather than automatic. Used by tests to show auto-freeing loses nothing.
 */
export function solveWithOptionalFrees(e: Engine, from: Board): number {
  const dist = new Map<number, number>();
  const deque: [Board, number][] = [[from, 0]];
  while (deque.length) {
    const [b, d] = deque.shift()!;
    const k = e.key(b);
    if (dist.has(k)) continue;
    dist.set(k, d);
    if (e.solved(b)) return d;
    for (const s of e.remaining(b)) {
      if (e.blockers(b, s) === 0) deque.unshift([{ tops: b.tops, freed: b.freed | (1 << s) }, d]);
    }
    for (const i of e.taps(b)) deque.push([e.flip(b, i), d + 1]);
  }
  throw new Error('level cannot be solved');
}

export function exactMinFlips(level: LevelDef): number {
  return new Engine(level).solve().flips;
}

/**
 * "Lazy" players: pull free whatever is free, otherwise make the one tap that
 * looks best right now. Every tie-break is explored, so this reports the
 * best a lazy player could get with perfect luck.
 */
export const lazyStyles = {
  // Get the strand that is closest to free closer still.
  closest: (e: Engine, b: Board) => {
    const rem = e.remaining(b);
    const counts = rem.map((s) => e.blockers(b, s)).sort((x, y) => x - y);
    return counts[0] * 100 + (counts[1] ?? 0);
  },
  // Reduce the total number of blocked spots on the board.
  fewestBlocked: (e: Engine, b: Board) => e.remaining(b).reduce((t, s) => t + e.blockers(b, s), 0),
};

export type LazyStyle = keyof typeof lazyStyles;

/**
 * Fewest flips any lazy line of this style finishes in, or Infinity if every
 * line loops or runs past `cap` flips.
 */
export function lazyBest(level: LevelDef, style: LazyStyle, cap = 20): number {
  const e = new Engine(level);
  const score = lazyStyles[style];
  let best = Infinity;
  const seen = new Map<number, number>();
  const walk = (b: Board, flips: number) => {
    if (flips >= best || flips > cap) return;
    if (e.solved(b)) {
      best = flips;
      return;
    }
    const k = e.key(b);
    if ((seen.get(k) ?? Infinity) <= flips) return;
    seen.set(k, flips);
    const options = e.taps(b).map((i) => {
      const nb = e.freeAll(e.flip(b, i));
      return { nb, s: e.solved(nb) ? -Infinity : score(e, nb) };
    });
    const top = Math.min(...options.map((o) => o.s));
    for (const o of options) if (o.s === top) walk(o.nb, flips + 1);
  };
  walk(e.freeAll(e.start), 0);
  return best;
}

/**
 * The lazy player in plain words: "free whatever's easiest". Pick the strand
 * that takes the fewest taps to free right now, tap the crossings holding it
 * down until it is free, pull it, repeat. The player is given the benefit of
 * the doubt: a strand that can't be freed that way (a Twin Bead keeps
 * re-blocking it) is skipped before any flips are spent on it, and every
 * tie between equally easy strands is explored. Returns the best and worst
 * finishing flips across those lines (Infinity = no strand can be freed by
 * tapping only its own crossings).
 */
export function lazyFreeEasiest(level: LevelDef): {
  best: number;
  worst: number;
  lines: number[];
  /** The crossing indexes tapped on each line, in order. */
  tapLines: number[][];
} {
  const e = new Engine(level);
  const lines: number[] = [];
  const tapLines: number[][] = [];
  // Taps until strand s is free using only crossings that block it, or null.
  const pay = (b: Board, s: number): (Board & { taps: number[] }) | null => {
    let cur = b;
    const taps: number[] = [];
    const seen = new Set<number>([e.key(cur)]);
    while (e.blockers(cur, s) > 0) {
      const i = e.taps(cur).find((t) => e.isBlocking(cur, t, s))!;
      cur = e.flip(cur, i);
      taps.push(i);
      if (seen.has(e.key(cur))) return null;
      seen.add(e.key(cur));
    }
    return { ...cur, taps };
  };
  const walk = (b0: Board, done: number[]) => {
    const b = e.freeAll(b0);
    const end = (flips: number) => {
      lines.push(flips);
      tapLines.push(done);
    };
    if (e.solved(b)) return end(done.length);
    const options = e.remaining(b).map((s) => pay(b, s));
    const costs = options.map((o) => (o ? o.taps.length : Infinity));
    const min = Math.min(...costs);
    if (min === Infinity) return end(Infinity);
    options.forEach((o, k) => {
      if (o && costs[k] === min) walk({ tops: o.tops, freed: o.freed }, [...done, ...o.taps]);
    });
  };
  walk(e.start, []);
  return { best: Math.min(...lines), worst: Math.max(...lines), lines, tapLines };
}

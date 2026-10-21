import { describe, expect, it } from 'vitest';
import { Puzzle } from '../src/logic/puzzle.ts';
import { Engine, lazyFreeEasiest } from '../src/logic/search.ts';
import { findCrossings } from '../src/logic/geometry.ts';
import { LEVELS } from '../src/levels/index.ts';
import type { LevelDef } from '../src/logic/types.ts';

/** Plays taps through the real Puzzle, pulling every strand free as soon as it can be. */
function play(level: LevelDef, taps: number[]): Puzzle {
  const p = new Puzzle(level);
  const freeAll = () => {
    for (let again = true; again; ) {
      again = false;
      for (const s of level.strands) if (p.free(s.id)) again = true;
    }
  };
  freeAll();
  for (const t of taps) {
    if (!p.flip(level.crossings[t].id)) break; // out of flips
    freeAll();
  }
  return p;
}

// What each level promises, so a tuning change has to update this table.
const EXPECTED: Record<string, { par: number; lazy: number }> = {
  'first-mess': { par: 3, lazy: 5 },
  'sock-drawer': { par: 3, lazy: 4 },
  'one-bead': { par: 3, lazy: 4 },
  'bead-curtain': { par: 3, lazy: 5 },
  'six-ply': { par: 4, lazy: 5 },
  'window-display': { par: 3, lazy: 6 },
  masterpiece: { par: 4, lazy: Infinity },
};

describe('Level set', () => {
  it('has 7 levels, at least 2 of them with Twin Beads', () => {
    expect(LEVELS).toHaveLength(7);
    expect(LEVELS.filter((l) => l.crossings.some((c) => c.bead)).length).toBeGreaterThanOrEqual(2);
  });
});

describe.each(LEVELS.map((l, i) => [`${i + 1}. ${l.name}`, l] as const))('%s', (_name, level) => {
  const e = new Engine(level);
  const best = e.solve();
  const lazy = lazyFreeEasiest(level);

  it('stays inside the 6-strand / 12-crossing caps', () => {
    expect(level.strands.length).toBeLessThanOrEqual(6);
    expect(level.crossings.length).toBeLessThanOrEqual(12);
  });

  it('draws exactly the crossings the logic knows about, far enough apart to tap', () => {
    const drawn = findCrossings(level.strands);
    expect(drawn).toHaveLength(level.crossings.length);
    for (const c of level.crossings) {
      const match = drawn.find((d) => Math.hypot(d.x - c.x, d.y - c.y) < 3);
      expect([match!.a, match!.b].sort()).toEqual([c.a, c.b].sort());
      for (const q of level.crossings) if (q !== c) expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeGreaterThanOrEqual(70);
    }
  });

  it('has nothing free at the start', () => {
    const p = new Puzzle(level);
    expect(level.strands.filter((s) => p.canFree(s.id))).toEqual([]);
  });

  it('a careful player wins inside the budget', () => {
    expect(best.flips).toBe(EXPECTED[level.id].par);
    expect(best.flips).toBeLessThanOrEqual(level.budget);
    const p = play(level, best.taps);
    expect(p.solved).toBe(true);
    expect(p.flips).toBe(best.flips);
  });

  it('a "free whatever’s easiest" player fails on every line', () => {
    expect(lazy.best).toBe(EXPECTED[level.id].lazy);
    expect(lazy.best).toBeGreaterThan(level.budget);
    for (const taps of lazy.tapLines) {
      const p = play(level, taps);
      expect(p.solved).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { Puzzle } from '../src/logic/puzzle.ts';
import { bestGreedy, exactMinFlips, optimalOrders, orderCost } from '../src/logic/solver.ts';
import { findCrossings } from '../src/logic/geometry.ts';
import { level1 } from '../src/levels/level1.ts';
import type { LevelDef } from '../src/logic/types.ts';

/** Plays a freeing order through the real Puzzle, flipping only what blocks the next strand. */
function play(level: LevelDef, order: string[]): Puzzle {
  const p = new Puzzle(level);
  for (const s of order) {
    for (const id of p.blockersOf(s)) p.flip(id);
    expect(p.free(s)).toBe(true);
  }
  return p;
}

describe('Level 1', () => {
  it('stays inside the 6-strand / 12-crossing caps', () => {
    expect(level1.strands.length).toBeLessThanOrEqual(6);
    expect(level1.crossings.length).toBeLessThanOrEqual(12);
  });

  it('draws exactly the crossings the logic knows about', () => {
    const drawn = findCrossings(level1.strands);
    expect(drawn).toHaveLength(level1.crossings.length);
    for (const c of level1.crossings) {
      const match = drawn.find((d) => Math.hypot(d.x - c.x, d.y - c.y) < 3);
      expect(match, `crossing ${c.id}`).toBeDefined();
      expect([match!.a, match!.b].sort()).toEqual([c.a, c.b].sort());
    }
  });

  it('keeps crossings far enough apart to tap', () => {
    for (const p of level1.crossings)
      for (const q of level1.crossings)
        if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(70);
  });

  it('has no strand free at the start', () => {
    const p = new Puzzle(level1);
    expect(level1.strands.filter((s) => p.canFree(s.id))).toEqual([]);
  });

  it('is solvable, in 3 flips at best, with exactly one best freeing order', () => {
    expect(exactMinFlips(level1)).toBe(3);
    const { cost, orders } = optimalOrders(level1);
    expect(cost).toBe(3);
    expect(orders).toEqual([['A', 'C', 'B', 'E', 'D']]);
    const p = play(level1, orders[0]);
    expect(p.solved).toBe(true);
    expect(p.flips).toBe(3);
  });

  it('is solvable from every freeing order (no dead ends), just not cheaply', () => {
    const ids = level1.strands.map((s) => s.id);
    const perms = (xs: string[]): string[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms(xs.filter((_, j) => j !== i)).map((r) => [x, ...r]));
    for (const order of perms(ids)) {
      const p = play(level1, order);
      expect(p.solved).toBe(true);
      expect(p.flips).toBe(orderCost(level1, order));
    }
  });

  it('beats every greedy heuristic from the spec: G > S', () => {
    expect(bestGreedy(level1)).toBe(4);
  });
});

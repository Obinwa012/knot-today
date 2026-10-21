import { describe, expect, it } from 'vitest';
import { exactMinFlips, optimalOrders } from '../src/logic/solver.ts';
import { Engine, solveWithOptionalFrees } from '../src/logic/search.ts';
import { Puzzle } from '../src/logic/puzzle.ts';
import { LEVELS } from '../src/levels/index.ts';

// Level 1 has no beads, so the freeing-order shortcut applies. Budget lifted
// so these tests can flip freely.
const level1 = { ...LEVELS[0], budget: 99 };
import type { LevelDef } from '../src/logic/types.ts';

const withTops = (mask: number): LevelDef => ({
  ...level1,
  crossings: level1.crossings.map((c, i) => ({ ...c, top: mask & (1 << i) ? c.b : c.a })),
});

describe('Solver', () => {
  it('exhaustive search agrees with best-freeing-order on all 1024 top assignments', () => {
    for (let mask = 0; mask < 1 << level1.crossings.length; mask++) {
      const lv = withTops(mask);
      expect(exactMinFlips(lv)).toBe(optimalOrders(lv).cost);
    }
  });

  it('freeing a strand that is already free never makes the rest harder', () => {
    // So freeing can never be a mistake; only flip choices can be.
    for (let mask = 0; mask < 1 << level1.crossings.length; mask += 7) {
      const lv = withTops(mask);
      const before = optimalOrders(lv).cost;
      const p = new Puzzle(lv);
      for (const s of lv.strands) {
        if (!p.canFree(s.id)) continue;
        const rest: LevelDef = {
          ...lv,
          strands: lv.strands.filter((x) => x.id !== s.id),
          crossings: lv.crossings.filter((c) => c.a !== s.id && c.b !== s.id),
        };
        expect(optimalOrders(rest).cost).toBe(before);
      }
    }
  });

  it('with Twin Beads too, pulling free strands right away never costs extra flips', () => {
    // Engine.solve frees strands the moment it can; a search where freeing
    // is optional (and so could wait) never finds anything shorter.
    for (const level of LEVELS.filter((l) => l.crossings.some((c) => c.bead))) {
      const e = new Engine(level);
      for (let tops = 0; tops < 1 << level.crossings.length; tops += 7) {
        const b = { tops, freed: 0 };
        expect(solveWithOptionalFrees(e, b)).toBe(e.solve(b).flips);
      }
    }
  });
});

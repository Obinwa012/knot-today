import { describe, expect, it } from 'vitest';
import { Puzzle } from '../src/logic/puzzle.ts';
import { level1 } from '../src/levels/level1.ts';
import type { LevelDef } from '../src/logic/types.ts';

const withTops = (mask: number): LevelDef => ({
  ...level1,
  crossings: level1.crossings.map((c, i) => ({ ...c, top: mask & (1 << i) ? c.b : c.a })),
});

describe('Puzzle rules', () => {
  it('flipping a crossing twice restores it and counts both flips', () => {
    const p = new Puzzle(level1);
    for (const c of level1.crossings) {
      const before = p.topOf(c.id);
      p.flip(c.id);
      expect(p.topOf(c.id)).not.toBe(before);
      p.flip(c.id);
      expect(p.topOf(c.id)).toBe(before);
    }
    expect(p.flips).toBe(level1.crossings.length * 2);
  });

  it('a strand is free exactly when it is on top at every one of its crossings (all 1024 boards)', () => {
    for (let mask = 0; mask < 1 << level1.crossings.length; mask++) {
      const lv = withTops(mask);
      const p = new Puzzle(lv);
      for (const s of lv.strands) {
        const mine = lv.crossings.filter((c) => c.a === s.id || c.b === s.id);
        expect(p.canFree(s.id)).toBe(mine.every((c) => c.top === s.id));
      }
    }
  });

  it('refuses to free a blocked strand, and leaves the board alone', () => {
    const p = new Puzzle(level1);
    const blocked = level1.strands.find((s) => !p.canFree(s.id))!;
    expect(p.free(blocked.id)).toBe(false);
    expect(p.isFreed(blocked.id)).toBe(false);
    expect(level1.crossings.every((c) => p.isLive(c.id))).toBe(true);
  });

  it('freeing removes only that strand’s crossings, which can no longer be flipped', () => {
    const p = new Puzzle(level1);
    for (const id of p.blockersOf('A')) p.flip(id);
    expect(p.free('A')).toBe(true);
    for (const c of level1.crossings) {
      const touchesA = c.a === 'A' || c.b === 'A';
      expect(p.isLive(c.id)).toBe(!touchesA);
      if (touchesA) expect(p.flip(c.id)).toBe(false);
    }
    expect(p.free('A')).toBe(false);
  });

  it('only counts crossings that are still live after a neighbour leaves', () => {
    // E is under B at c10; once B is gone, E no longer needs that flip.
    const p = new Puzzle(level1);
    expect(p.blockersOf('E')).toEqual(['c10']);
    for (const id of p.blockersOf('B')) p.flip(id);
    for (const id of p.blockersOf('A')) p.flip(id);
    p.free('A');
    for (const id of p.blockersOf('B')) p.flip(id);
    expect(p.free('B')).toBe(true);
    expect(p.blockersOf('E')).toEqual([]);
  });

  it('reset puts the board back to the authored start', () => {
    const p = new Puzzle(level1);
    p.flip('c2');
    p.free('A');
    p.reset();
    expect(p.flips).toBe(0);
    expect(level1.crossings.every((c) => p.topOf(c.id) === c.top)).toBe(true);
  });
});

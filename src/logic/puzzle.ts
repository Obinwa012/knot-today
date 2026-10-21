import type { LevelDef } from './types.ts';

/**
 * Pure, render-free puzzle state. The Phaser scene only reads it and calls
 * flip / free; tests drive it directly.
 *
 * Rules:
 *  - Each live crossing has exactly one of its two strands on top.
 *  - flip(c) swaps which strand is on top. Flipping twice is a no-op.
 *  - A strand can be freed only when it is on top at every live crossing it
 *    belongs to. Freeing removes the strand and all of its crossings.
 */
export class Puzzle {
  readonly level: LevelDef;
  /** crossing id -> strand id currently on top. Only live crossings. */
  private tops = new Map<string, string>();
  private freed = new Set<string>();
  private freeOrder: string[] = [];
  flips = 0;

  constructor(level: LevelDef) {
    this.level = level;
    this.reset();
  }

  reset(): void {
    this.tops.clear();
    for (const c of this.level.crossings) this.tops.set(c.id, c.top);
    this.freed.clear();
    this.freeOrder = [];
    this.flips = 0;
  }

  isLive(crossingId: string): boolean {
    return this.tops.has(crossingId);
  }

  topOf(crossingId: string): string | undefined {
    return this.tops.get(crossingId);
  }

  isFreed(strandId: string): boolean {
    return this.freed.has(strandId);
  }

  get freedOrder(): readonly string[] {
    return this.freeOrder;
  }

  liveCrossingsOf(strandId: string): string[] {
    return this.level.crossings
      .filter((c) => this.tops.has(c.id) && (c.a === strandId || c.b === strandId))
      .map((c) => c.id);
  }

  /** Live crossings where this strand is currently underneath. */
  blockersOf(strandId: string): string[] {
    return this.liveCrossingsOf(strandId).filter((id) => this.tops.get(id) !== strandId);
  }

  canFree(strandId: string): boolean {
    return !this.freed.has(strandId) && this.blockersOf(strandId).length === 0;
  }

  flip(crossingId: string): boolean {
    const c = this.level.crossings.find((k) => k.id === crossingId);
    const top = this.tops.get(crossingId);
    if (!c || top === undefined) return false;
    this.tops.set(crossingId, top === c.a ? c.b : c.a);
    this.flips++;
    return true;
  }

  free(strandId: string): boolean {
    if (!this.canFree(strandId)) return false;
    for (const id of this.liveCrossingsOf(strandId)) this.tops.delete(id);
    this.freed.add(strandId);
    this.freeOrder.push(strandId);
    return true;
  }

  get solved(): boolean {
    return this.freed.size === this.level.strands.length;
  }
}

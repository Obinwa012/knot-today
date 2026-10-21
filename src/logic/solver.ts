import type { LevelDef } from './types.ts';

/**
 * Solver helpers for the core rule. Two independent ways to get the optimum
 * (exhaustive state search and "best freeing order") so tests can check one
 * against the other. The freeing-order shortcut only holds without Twin
 * Beads, where every crossing flips on its own.
 */

type Tops = Record<string, string>;

function initialTops(level: LevelDef): Tops {
  return Object.fromEntries(level.crossings.map((c) => [c.id, c.top]));
}

/** Exact minimum, by searching every reachable board. Handles Twin Beads. */
export { exactMinFlips } from './search.ts';

/**
 * Flips needed if strands are freed in this order and the player never
 * wastes a flip: each crossing must show whichever of its strands leaves
 * first, so it costs 1 exactly when that strand starts underneath.
 */
export function orderCost(level: LevelDef, order: string[], tops: Tops = initialTops(level)): number {
  const pos = new Map(order.map((s, i) => [s, i]));
  let cost = 0;
  for (const c of level.crossings) {
    const first = pos.get(c.a)! < pos.get(c.b)! ? c.a : c.b;
    if (tops[c.id] !== first) cost++;
  }
  return cost;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export function optimalOrders(level: LevelDef): { cost: number; orders: string[][] } {
  let cost = Infinity;
  let orders: string[][] = [];
  for (const p of permutations(level.strands.map((s) => s.id))) {
    const k = orderCost(level, p);
    if (k < cost) {
      cost = k;
      orders = [p];
    } else if (k === cost) orders.push(p);
  }
  return { cost, orders };
}

/** Score for the next strand to pay for; lower is preferred. */
type Heuristic = (remaining: string[], s: string, tops: Tops) => number;

function blockers(level: LevelDef, remaining: Set<string>, s: string, tops: Tops): number {
  let n = 0;
  for (const c of level.crossings) {
    if (!remaining.has(c.a) || !remaining.has(c.b)) continue;
    if ((c.a === s || c.b === s) && tops[c.id] !== s) n++;
  }
  return n;
}

function liveCount(level: LevelDef, remaining: Set<string>, s: string): number {
  return level.crossings.filter((c) => remaining.has(c.a) && remaining.has(c.b) && (c.a === s || c.b === s)).length;
}

export function heuristics(level: LevelDef): Record<string, Heuristic> {
  const b = (rem: string[], s: string, t: Tops) => blockers(level, new Set(rem), s, t);
  return {
    // Fewest flips to free right now (free-now-first is the 0 case).
    fewestFlips: b,
    // Prefer the strand that clears the most crossings; free ones always first.
    mostCleared: (rem, s, t) => (b(rem, s, t) === 0 ? -1000 : -liveCount(level, new Set(rem), s)),
    // Fewest flips for this strand plus the cheapest next strand after it.
    lookahead1: (rem, s, t) => {
      const rest = rem.filter((x) => x !== s);
      const next = rest.length ? Math.min(...rest.map((x) => b(rest, x, t))) : 0;
      return b(rem, s, t) + next;
    },
  };
}

/**
 * Every result a greedy player using this heuristic can get, across all
 * tie-breaks. Greedy players pay only for the strand they pick, so the cost
 * of a run is its order's cost.
 */
export function greedyResults(level: LevelDef, h: Heuristic): number[] {
  const tops = initialTops(level);
  const out: number[] = [];
  const walk = (remaining: string[], order: string[]) => {
    if (!remaining.length) {
      out.push(orderCost(level, order));
      return;
    }
    const scores = remaining.map((s) => h(remaining, s, tops));
    const best = Math.min(...scores);
    remaining.forEach((s, i) => {
      if (scores[i] === best) walk(remaining.filter((x) => x !== s), [...order, s]);
    });
  };
  walk(level.strands.map((s) => s.id), []);
  return out;
}

/** G in the spec's ship rule: the best any greedy heuristic and tie-break achieves. */
export function bestGreedy(level: LevelDef): number {
  return Math.min(...Object.values(heuristics(level)).flatMap((h) => greedyResults(level, h)));
}

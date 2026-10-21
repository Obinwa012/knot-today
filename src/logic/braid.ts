import { findCrossings } from './geometry.ts';
import type { CrossingDef, LevelDef, Pattern, Point } from './types.ts';

export interface BraidSpec {
  id: string;
  name: string;
  /** Strands in their starting left-to-right order. */
  strands: { id: string; color: number; pattern: Pattern }[];
  /**
   * The braid word, one row at a time. Each row lists the slots p whose
   * strands swap (slot p with slot p + 1). Each swap is one crossing.
   */
  rows: number[][];
  /** Which strand starts on top, one per crossing in reading order. */
  tops: string[];
  layout: { left: number; right: number; top: number; bottom: number };
}

/**
 * Turns a braid word into level data: strand paths for drawing and one
 * crossing per swap. Authoring levels as braid words keeps the drawing and
 * the logic from drifting apart.
 */
export function buildBraidLevel(spec: BraidSpec): LevelDef {
  const n = spec.strands.length;
  const { left, right, top, bottom } = spec.layout;
  const slotX = (p: number) => left + ((right - left) * p) / (n - 1);
  const rowCount = spec.rows.length + 1;
  const rowY = (r: number) => top + ((bottom - top) * r) / (rowCount - 1);

  let order = spec.strands.map((s) => s.id);
  const paths = new Map<string, Point[]>(order.map((id, p) => [id, [{ x: slotX(p), y: rowY(0) }]]));
  const crossings: CrossingDef[] = [];
  spec.rows.forEach((row, r) => {
    const next = [...order];
    for (const p of row) {
      const [a, b] = [order[p], order[p + 1]];
      [next[p], next[p + 1]] = [b, a];
      const i = crossings.length;
      const topId = spec.tops[i];
      if (topId !== a && topId !== b) throw new Error(`crossing ${i + 1}: top ${topId} is not ${a} or ${b}`);
      crossings.push({ id: `c${i + 1}`, a, b, top: topId, x: (slotX(p) + slotX(p + 1)) / 2, y: (rowY(r) + rowY(r + 1)) / 2 });
    }
    order = next;
    order.forEach((id, p) => paths.get(id)!.push({ x: slotX(p), y: rowY(r + 1) }));
  });
  if (crossings.length !== spec.tops.length) throw new Error(`${crossings.length} crossings but ${spec.tops.length} tops`);

  // A short straight lead at each end so the strands read as hanging yarn.
  const lead = (bottom - top) / (rowCount - 1) / 2;
  for (const pts of paths.values()) {
    pts.unshift({ x: pts[0].x, y: pts[0].y - lead });
    pts.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y + lead });
  }

  const strands = spec.strands.map((s) => ({ ...s, points: paths.get(s.id)! }));

  // The smoothed curves cross a few pixels off the row midpoints; snap each
  // crossing to where it is actually drawn so taps land on it.
  const drawn = findCrossings(strands);
  if (drawn.length !== crossings.length) throw new Error(`drawn paths cross ${drawn.length} times, braid says ${crossings.length}`);
  for (const c of crossings) {
    const near = drawn
      .filter((d) => (d.a === c.a && d.b === c.b) || (d.a === c.b && d.b === c.a))
      .sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y))[0];
    if (!near || Math.hypot(near.x - c.x, near.y - c.y) > 20) throw new Error(`crossing ${c.id} is not where the curves cross`);
    c.x = near.x;
    c.y = near.y;
  }

  return { id: spec.id, name: spec.name, strands, crossings };
}

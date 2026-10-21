import type { Point, StrandDef } from './types.ts';

/** Samples a centripetal-free (uniform) Catmull-Rom spline through the points. */
export function samplePath(points: Point[], stepsPerSegment = 24): Point[] {
  const out: Point[] = [];
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function segIntersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

export interface FoundCrossing {
  a: string;
  b: string;
  x: number;
  y: number;
}

/** Every point where two different strands' drawn paths cross. */
export function findCrossings(strands: StrandDef[]): FoundCrossing[] {
  const paths = strands.map((s) => samplePath(s.points));
  const out: FoundCrossing[] = [];
  for (let i = 0; i < strands.length; i++) {
    for (let j = i + 1; j < strands.length; j++) {
      const P = paths[i], Q = paths[j];
      for (let k = 0; k < P.length - 1; k++) {
        for (let m = 0; m < Q.length - 1; m++) {
          const hit = segIntersect(P[k], P[k + 1], Q[m], Q[m + 1]);
          if (hit) out.push({ a: strands[i].id, b: strands[j].id, ...hit });
        }
      }
    }
  }
  return out;
}

export function distToPath(p: Point, path: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

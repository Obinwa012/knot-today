// Authoring aid: for a hand-drawn braid, tries every starting top (and, for
// Twin Bead levels, every nearby bead placement) and lists the boards where
// lazy play loses to careful play by the widest margin.
// Run: node scripts/find-tops.ts <braid.json>
//   braid.json: { strands: n, rows: number[][], beads: 0 | 1 | 2 }
import { readFileSync } from 'node:fs';
import { buildBraidLevel } from '../src/logic/braid.ts';
import { Engine, lazyBest, lazyFreeEasiest } from '../src/logic/search.ts';
import type { Pattern } from '../src/logic/types.ts';

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { strands: number; rows: number[][]; beads: number; maxBeadDist?: number };
const ids = 'ABCDEF'.slice(0, cfg.strands).split('');
const strands = ids.map((id) => ({ id, color: 0, pattern: 'solid' as Pattern }));
const layout = { left: 150, right: 570, top: 290, bottom: 1050 };
const base = buildBraidLevel({ id: 'x', name: 'x', strands, rows: cfg.rows, tops: [], budget: 99, layout, dryRun: true } as never);
const n = base.crossings.length;

// Candidate bead pairs: different strand pairs, close enough to read as linked.
const pairs: [number, number][] = [];
for (let i = 0; i < n; i++)
  for (let j = i + 1; j < n; j++) {
    const p = base.crossings[i], q = base.crossings[j];
    const samePair = [p.a, p.b].sort().join() === [q.a, q.b].sort().join();
    if (!samePair && Math.hypot(p.x - q.x, p.y - q.y) <= (cfg.maxBeadDist ?? 260)) pairs.push([i + 1, j + 1]);
  }
const beadSets: [number, number][][] = [[]];
if (cfg.beads === 1) beadSets.splice(0, 1, ...pairs.map((p) => [p]));
if (cfg.beads === 2) {
  beadSets.length = 0;
  for (let a = 0; a < pairs.length; a++)
    for (let b = a + 1; b < pairs.length; b++)
      if (new Set([...pairs[a], ...pairs[b]]).size === 4) beadSets.push([pairs[a], pairs[b]]);
}

type Hit = { S: number; lazy: number; worst: number; tapGreedy: number; beads: [number, number][]; tops: string[] };
const hits: Hit[] = [];
for (const beads of beadSets) {
  for (let mask = 0; mask < 1 << n; mask++) {
    const tops = base.crossings.map((c, i) => (mask & (1 << i) ? c.b : c.a));
    const level = { ...base, crossings: base.crossings.map((c, i) => ({ ...c, top: tops[i], bead: undefined as string | undefined })) };
    beads.forEach(([p, q], k) => {
      level.crossings[p - 1].bead = level.crossings[q - 1].bead = `b${k}`;
    });
    const e = new Engine(level);
    if (e.remaining(e.start).some((s) => e.blockers(e.start, s) === 0)) continue;
    const S = e.solve().flips;
    if (S < 3) continue;
    const { best: lazy, worst } = lazyFreeEasiest(level);
    if (lazy <= S) continue;
    const tapGreedy = Math.min(lazyBest(level, 'closest', S + 6), lazyBest(level, 'fewestBlocked', S + 6));
    hits.push({ S, lazy, worst, tapGreedy, beads, tops });
  }
}
hits.sort((x, y) => y.lazy - y.S - (x.lazy - x.S) || y.tapGreedy - x.tapGreedy || x.S - y.S);
console.log(`${n} crossings, ${beadSets.length} bead layouts, ${hits.length} boards where lazy loses`);
for (const h of hits.slice(0, 8)) console.log(JSON.stringify(h));

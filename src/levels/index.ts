import { buildBraidLevel, type BraidSpec } from '../logic/braid.ts';
import type { LevelDef, Pattern } from '../logic/types.ts';

// One look per strand letter across every level: colour plus pattern.
const STRANDS: Record<string, { color: number; pattern: Pattern }> = {
  A: { color: 0xe69f00, pattern: 'solid' }, // orange
  B: { color: 0x56b4e9, pattern: 'dots' }, // sky blue
  C: { color: 0x009e73, pattern: 'dashes' }, // green
  D: { color: 0xcc79a7, pattern: 'stripes' }, // pink
  E: { color: 0xd55e00, pattern: 'rings' }, // vermilion
  F: { color: 0xf0e442, pattern: 'squares' }, // yellow
};

const LAYOUT = { left: 150, right: 570, top: 290, bottom: 1050 };

/** `mirror` draws the braid left-to-right reversed, so a reused shape looks new. */
function level(spec: Omit<BraidSpec, 'strands' | 'layout'> & { strands: number; mirror?: boolean }): LevelDef {
  const strands = 'ABCDEF'
    .slice(0, spec.strands)
    .split('')
    .map((id) => ({ id, ...STRANDS[id] }));
  const layout = spec.mirror ? { ...LAYOUT, left: LAYOUT.right, right: LAYOUT.left } : LAYOUT;
  return buildBraidLevel({ ...spec, strands, layout });
}

// Each braid shape was drawn by hand; starting tops and beads were then
// tuned until a "free whatever's easiest" player runs out of flips on every
// line while the best line fits with room to spare where possible. The
// numbers in each comment are checked in tests/levels.test.ts.
export const LEVELS: LevelDef[] = [
  // Par 3, budget 4. Lazy needs 5. The green/pink twist costs 2 whoever
  // leaves first; lazy dodges it and pays twice.
  level({
    id: 'first-mess',
    name: 'Biscuit’s First Mess',
    strands: 5,
    rows: [[2], [0], [2], [0], [2], [2], [1], [3], [0], [2]],
    tops: ['C', 'A', 'D', 'B', 'C', 'D', 'C', 'D', 'A', 'B'],
    budget: 4,
  }),
  // Par 3, budget 3. Lazy needs 4.
  level({
    id: 'sock-drawer',
    name: 'The Sock Drawer',
    strands: 5,
    rows: [[1], [1], [3], [3], [2], [0], [2], [1, 3]],
    tops: ['B', 'C', 'D', 'E', 'C', 'A', 'D', 'C', 'D'],
    budget: 3,
  }),
  // Twin Bead intro. Par 3, budget 3. Lazy needs 4.
  level({
    id: 'one-bead',
    name: 'One Bead, Two Knots',
    strands: 4,
    rows: [[1], [0, 2], [0, 2], [1], [0], [2]],
    tops: ['B', 'C', 'B', 'C', 'D', 'C', 'A', 'C'],
    beads: [[1, 2]],
    budget: 3,
  }),
  // Twin Bead. Par 3, budget 4. Lazy needs 5.
  level({
    id: 'bead-curtain',
    name: 'Bead Curtain',
    strands: 5,
    rows: [[1], [1], [1], [0, 3], [2], [2], [1, 3]],
    tops: ['C', 'B', 'C', 'C', 'D', 'B', 'E', 'A', 'E'],
    beads: [[2, 4]],
    budget: 4,
  }),
  // Six strands, no beads. Par 4, budget 4. Lazy needs 5.
  level({
    id: 'six-ply',
    name: 'Six-Ply Trouble',
    strands: 6,
    rows: [[1, 3], [1, 3], [0, 2, 4], [2], [1, 3], [0]],
    tops: ['C', 'D', 'C', 'E', 'B', 'C', 'F', 'D', 'A', 'D', 'B'],
    budget: 4,
  }),
  // Twin Bead. Par 3, budget 5. Lazy needs 6.
  level({
    id: 'window-display',
    name: 'Window Display',
    strands: 6,
    rows: [[1, 3], [1, 3], [0, 2, 4], [2], [1, 3], [0]],
    tops: ['B', 'D', 'C', 'E', 'B', 'C', 'F', 'D', 'A', 'D', 'B'],
    beads: [[3, 5]],
    budget: 5,
    mirror: true,
  }),
  // Two Twin Beads. Par 4, budget 5. Lazy gets stuck: every strand it
  // tries to pay for is re-blocked by a bead.
  level({
    id: 'masterpiece',
    name: 'Biscuit’s Masterpiece',
    strands: 5,
    rows: [[1], [1], [1], [0, 3], [2], [2], [1, 3]],
    tops: ['B', 'C', 'B', 'C', 'D', 'E', 'E', 'A', 'E'],
    beads: [[5, 6], [7, 9]],
    budget: 5,
    mirror: true,
  }),
];

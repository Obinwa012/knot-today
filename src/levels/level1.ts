import { buildBraidLevel } from '../logic/braid.ts';

// Hand-picked from a solver search (scripts/design-level.ts): nobody is free
// at the start, the best solution is 3 flips with exactly one freeing order
// (A, C, B, E, D), and every greedy heuristic in the spec ends on 4 or more.
// The lesson: the green/pink twist costs 2 flips whoever goes first, so pay
// it before freeing blue, or blue's crossing with green costs an extra flip.
export const level1 = buildBraidLevel({
  id: 'level-1',
  name: 'Biscuit’s First Mess',
  strands: [
    { id: 'A', color: 0xe69f00, pattern: 'solid' }, // orange
    { id: 'B', color: 0x56b4e9, pattern: 'dots' }, // sky blue
    { id: 'C', color: 0x009e73, pattern: 'dashes' }, // green
    { id: 'D', color: 0xcc79a7, pattern: 'stripes' }, // pink
    { id: 'E', color: 0xd55e00, pattern: 'rings' }, // vermilion
  ],
  rows: [[2], [0], [2], [0], [2], [2], [1], [3], [0], [2]],
  tops: ['C', 'A', 'D', 'B', 'C', 'D', 'C', 'E', 'A', 'B'],
  layout: { left: 150, right: 570, top: 290, bottom: 1050 },
});

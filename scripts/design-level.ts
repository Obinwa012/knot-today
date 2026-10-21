// Authoring check for level 1: crossings found in the drawn geometry, how far
// apart they are (tap targets), and the solver numbers.
// Run: node scripts/design-level.ts
import { findCrossings } from '../src/logic/geometry.ts';
import { bestGreedy, exactMinFlips, optimalOrders } from '../src/logic/solver.ts';
import { level1 } from '../src/levels/level1.ts';

const found = findCrossings(level1.strands);
console.log(`${found.length} drawn crossings, ${level1.crossings.length} authored`);
for (const c of level1.crossings) console.log(`  ${c.id} ${c.a}/${c.b} top=${c.top} at (${c.x}, ${c.y})`);
let gap = Infinity;
for (const p of level1.crossings)
  for (const q of level1.crossings) if (p !== q) gap = Math.min(gap, Math.hypot(p.x - q.x, p.y - q.y));
console.log(`closest crossings: ${gap.toFixed(0)}px apart`);
const { cost, orders } = optimalOrders(level1);
console.log(`optimum S=${cost} (exact search ${exactMinFlips(level1)}), orders: ${orders.map((o) => o.join('')).join(', ')}`);
console.log(`best greedy G=${bestGreedy(level1)}`);

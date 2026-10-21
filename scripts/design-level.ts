// Prints every level's numbers: par, budget, and how the lazy player does.
// Run: node scripts/design-level.ts
import { LEVELS } from '../src/levels/index.ts';
import { Engine, lazyBest, lazyFreeEasiest } from '../src/logic/search.ts';

for (const [i, lv] of LEVELS.entries()) {
  const e = new Engine(lv);
  const best = e.solve();
  const lazy = lazyFreeEasiest(lv);
  const peek = Math.min(lazyBest(lv, 'closest'), lazyBest(lv, 'fewestBlocked'));
  const beads = lv.crossings.filter((c) => c.bead).length / 2;
  console.log(
    `${i + 1}. ${lv.name}: ${lv.strands.length} strands, ${lv.crossings.length} crossings, ${beads} beads | ` +
      `par ${best.flips}, budget ${lv.budget} | lazy best ${lazy.best}, worst ${lazy.worst} | one-tap-lookahead ${peek}`,
  );
  console.log(`   careful line: ${best.taps.map((t) => lv.crossings[t].id).join(' ')}`);
}

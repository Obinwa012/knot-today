# Knot Today: playable prototype

A grey-box web prototype of the core verb from the Knot Today spec (v2.1,
prototype gate only). Seven hand-made levels, four with Twin Beads, built with
TypeScript, Phaser 4 and Vite.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) 20 or newer.
2. In this folder, run `npm install` once.
3. Run `npm run dev` and open the address it prints (usually
   http://localhost:5173). To try it on your phone, connect it to the same
   Wi-Fi and open the "Network" address it prints.

Other commands:

- `npm test` runs the logic tests (rules, solvability, solver checks).
- `npm run build` type-checks and builds the static site into `dist/`.
- `node scripts/design-level.ts` prints each level's par, budget and how a lazy
  player does.
- `node scripts/find-tops.ts braid.json` helps tune a new braid shape (see the
  comment at the top of the file).

## How to play

- Five strands of yarn hang down the board. Where two cross, one is on top.
- Tap a crossing to flip which strand is on top. Tap it again to flip it back.
- A strand can be pulled free only when it is on top at every crossing it
  still has. When that is true it glows and its handle bounces. Tap the strand
  or its lettered handle to pull it out. Its crossings disappear with it.
- Tap a strand that is not ready and the crossings holding it down flash red.
- Press and hold a strand to fade the others and trace its path.
- Gold thread ties two crossings to one Twin Bead. Tap either crossing and
  both flip, for one flip.
- Each level has a flip budget (top right). Run out with strands still stuck
  and the level is lost. Par is the fewest flips possible. Retrying is free.
- Free every strand to win. "Start over" resets; ‹ and › change level.

## Deploy to Vercel

Push this folder to a GitHub repo, then in Vercel choose "Add New Project" and
import it. Vercel detects Vite; `vercel.json` pins the build command
(`npm run build`) and output folder (`dist`). Or run `npx vercel` here.

## Layout

- `src/logic/` pure rules, no Phaser: `puzzle.ts` (state, flip, free, Twin
  Beads, budget), `search.ts` (exact solver and the "free whatever's easiest"
  lazy player), `solver.ts` (freeing-order shortcuts for bead-free levels),
  `braid.ts` (builds a level from a braid word), `geometry.ts` (curves).
- `src/levels/index.ts` the seven levels, each written as a braid word plus
  starting tops, Twin Beads and a flip budget.
- `src/scenes/PlayScene.ts` the Phaser scene: drawing, taps, animation.
- `tests/` Vitest tests.

# Knot Today: playable prototype

A grey-box web prototype of the core verb from the Knot Today spec (v2.1,
prototype gate only). One hand-authored level, built with TypeScript, Phaser 4
and Vite.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) 20 or newer.
2. In this folder, run `npm install` once.
3. Run `npm run dev` and open the address it prints (usually
   http://localhost:5173). To try it on your phone, connect it to the same
   Wi-Fi and open the "Network" address it prints.

Other commands:

- `npm test` runs the logic tests (rules, solvability, solver checks).
- `npm run build` type-checks and builds the static site into `dist/`.
- `node scripts/design-level.ts` prints level 1's crossings and solver numbers.

## How to play

- Five strands of yarn hang down the board. Where two cross, one is on top.
- Tap a crossing to flip which strand is on top. Tap it again to flip it back.
- A strand can be pulled free only when it is on top at every crossing it
  still has. When that is true it glows and its handle bounces. Tap the strand
  or its lettered handle to pull it out. Its crossings disappear with it.
- Tap a strand that is not ready and the crossings holding it down flash red.
- Press and hold a strand to fade the others and trace its path.
- Free all five. Par (the fewest possible flips) is 3. "Start over" resets.

## Deploy to Vercel

Push this folder to a GitHub repo, then in Vercel choose "Add New Project" and
import it. Vercel detects Vite; `vercel.json` pins the build command
(`npm run build`) and output folder (`dist`). Or run `npx vercel` here.

## Layout

- `src/logic/` pure rules, no Phaser: `puzzle.ts` (state, flip, free),
  `solver.ts` (exact search, best freeing order, the spec's greedy players),
  `braid.ts` (builds a level from a braid word), `geometry.ts` (curves).
- `src/levels/level1.ts` the hand-authored level, written as a braid word.
- `src/scenes/PlayScene.ts` the Phaser scene: drawing, taps, animation.
- `tests/` Vitest tests.

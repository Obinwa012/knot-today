export interface Point {
  x: number;
  y: number;
}

export type Pattern = 'solid' | 'dots' | 'dashes' | 'stripes' | 'rings' | 'squares';

export interface StrandDef {
  id: string;
  /** Fill colour as 0xRRGGBB. */
  color: number;
  /** Second cue so colour is never the only way to tell strands apart. */
  pattern: Pattern;
  /** Control points; the drawn path is a Catmull-Rom spline through them. */
  points: Point[];
}

export interface CrossingDef {
  id: string;
  /** The two strands that meet here. */
  a: string;
  b: string;
  /** Which of a / b starts on top. */
  top: string;
  /** Where to draw and hit-test the crossing. Must match the geometry. */
  x: number;
  y: number;
  /**
   * Twin Bead: crossings that share a bead id flip together, for one flip.
   * Once one of them is gone (its strand freed) the bead flips the rest.
   */
  bead?: string;
}

export interface LevelDef {
  id: string;
  name: string;
  strands: StrandDef[];
  crossings: CrossingDef[];
  /** Flips allowed before the level is failed. */
  budget: number;
}

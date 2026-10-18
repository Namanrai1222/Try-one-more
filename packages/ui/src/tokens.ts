/**
 * Design tokens — the single source of truth (DESIGNING.md §2).
 *
 * `tokens.css` is GENERATED from this file (`pnpm --filter @jom/ui generate`), and a
 * test fails if the two drift. This is the only file in the repo allowed to contain
 * hex colours; `tooling/scripts/check-no-hex.mjs` enforces that in CI.
 */

/** Cheap Indian print: duplicating paper, ballpoint, teacher's red pen, marigold, photocopier black. */
export const colors = {
  ink: '#16213A',
  paper: '#E4DCC4',
  'paper-shadow': '#CFC4A6',
  'red-pen': '#C41E3A',
  marigold: '#F0A202',
  carbon: '#0D0B12',
  chalk: '#F5F2E8',
  saw: '#7A8BA6',
  /**
   * Multiplayer seats 2–4 (seat 1 is marigold). Hues from the Okabe–Ito palette, which is
   * designed to stay distinguishable with common colour-vision deficiencies (DESIGNING.md §8
   * Phase 5). Seats also carry a number, so colour is never the only cue.
   */
  sky: '#56B4E9',
  jade: '#009E73',
  orchid: '#CC79A7',
  /** Push Party seats 5–7 (seat 8 is chalk), the rest of Okabe–Ito. Bodies only, never text. */
  lemon: '#F0E442',
  cobalt: '#0072B2',
  vermilion: '#D55E00',
  /**
   * The invigilator's desk (DESIGN.md): the dark ground under every shell page. Paper slips
   * (paper/ink) sit on it; `go` is the one bright affordance; `desk-fail` is red pen on dark.
   */
  'desk-ink': '#F4F1E6',
  desk: '#111A2E',
  'desk-raised': '#14233E',
  'desk-deep': '#090F1D',
  'desk-line': '#596B86',
  'desk-muted': '#8497B0',
  'desk-fail': '#FF7766',
  go: '#DBF367',
} as const;

export type ColorToken = keyof typeof colors;

/** 1.25 minor third on a 16px base. */
export const typeScale = {
  xs: '12.8px',
  sm: '16px',
  md: '20px',
  lg: '25px',
  xl: '39px',
  '2xl': '61px',
} as const;

/** 4px base grid. Emitted as --space-1 … --space-8. */
export const space = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const radius = {
  /** Everything in the shell — it is paper, paper has corners. */
  '0': '0px',
  /** The single exception: primary buttons, so they read as pressable. */
  sm: '2px',
} as const;

export const fontFamilies = {
  display: "'Khand', 'IBM Plex Sans', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const motion = {
  /** Everything else: 150ms ease-out, or nothing. */
  fast: '150ms',
  /** Death slash. */
  slash: '120ms',
  ease: 'ease-out',
} as const;

/** Numeric colour for canvas/WebGL APIs, e.g. `colorInt('carbon')`. */
export function colorInt(token: ColorToken): number {
  return Number.parseInt(colors[token].slice(1), 16);
}

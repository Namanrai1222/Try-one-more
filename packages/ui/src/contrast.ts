import { colors } from './tokens.ts';
import type { ColorToken } from './tokens.ts';

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
export function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * - text: body-size text, WCAG AA 4.5:1
 * - large-text: ≥24px (or ≥18.66px bold) only, 3:1
 * - non-text: focus rings, hazard shapes, UI boundaries, 3:1 (WCAG 1.4.11)
 * - never-text: documented as forbidden for text; must NOT be used for text at all
 */
export type PairingUse = 'text' | 'large-text' | 'non-text' | 'never-text';

export const REQUIRED_RATIO: Record<PairingUse, number> = {
  text: 4.5,
  'large-text': 3,
  'non-text': 3,
  'never-text': 0,
};

export interface Pairing {
  fg: ColorToken;
  bg: ColorToken;
  use: PairingUse;
  where: string;
}

/** Every approved token pairing. Adding a new pairing to the UI means adding it here. */
export const PAIRINGS: readonly Pairing[] = [
  { fg: 'ink', bg: 'paper', use: 'text', where: 'Shell body text, masthead, rules' },
  { fg: 'ink', bg: 'paper-shadow', use: 'text', where: 'Text on inactive rows' },
  { fg: 'paper', bg: 'ink', use: 'text', where: 'Primary "Play" button — the only filled button' },
  { fg: 'ink', bg: 'marigold', use: 'text', where: 'Share button on the result slip' },
  {
    fg: 'red-pen',
    bg: 'paper',
    use: 'large-text',
    where: 'Death number (61px mono) on the result slip. Not for body-size text.',
  },
  { fg: 'red-pen', bg: 'paper', use: 'non-text', where: 'Focus rings (2px offset)' },
  { fg: 'chalk', bg: 'carbon', use: 'text', where: 'In-level HUD, taunt line' },
  { fg: 'marigold', bg: 'carbon', use: 'text', where: 'Coins, progress, success in-level' },
  {
    fg: 'red-pen',
    bg: 'carbon',
    use: 'non-text',
    where: 'Spikes and hazards (also silhouette-distinct)',
  },
  { fg: 'saw', bg: 'carbon', use: 'non-text', where: 'Saw / hazard metal' },
  { fg: 'sky', bg: 'carbon', use: 'text', where: 'Seat 2 name and marker in party play' },
  { fg: 'jade', bg: 'carbon', use: 'text', where: 'Seat 3 name and marker in party play' },
  { fg: 'orchid', bg: 'carbon', use: 'text', where: 'Seat 4 name and marker in party play' },
  { fg: 'lemon', bg: 'carbon', use: 'non-text', where: 'Seat 5 body in Push Party' },
  { fg: 'cobalt', bg: 'carbon', use: 'non-text', where: 'Seat 6 body in Push Party' },
  { fg: 'vermilion', bg: 'carbon', use: 'non-text', where: 'Seat 7 body in Push Party' },
  {
    fg: 'ink',
    bg: 'paper',
    use: 'non-text',
    where: 'Seat swatch outline (the fill is a seat colour; the label carries the number)',
  },
  {
    fg: 'marigold',
    bg: 'paper',
    use: 'never-text',
    where: 'Forbidden for text (DESIGNING.md §2.1)',
  },
];

export interface PairingResult extends Pairing {
  ratio: number;
  required: number;
  pass: boolean;
}

export function auditPairings(pairings: readonly Pairing[] = PAIRINGS): PairingResult[] {
  return pairings.map((p) => {
    const ratio = contrastRatio(colors[p.fg], colors[p.bg]);
    const required = REQUIRED_RATIO[p.use];
    const pass = p.use === 'never-text' ? ratio < REQUIRED_RATIO.text : ratio >= required;
    return { ...p, ratio, required, pass };
  });
}

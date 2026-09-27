import { describe, expect, it } from 'vitest';
import { PAIRINGS, auditPairings, colors, contrastRatio } from '../src/index.ts';

describe('contrast', () => {
  it('computes the WCAG extremes correctly', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it.each(auditPairings().map((r) => [`${r.fg} on ${r.bg} (${r.use})`, r] as const))(
    '%s meets its requirement',
    (_label, result) => {
      expect(result.pass, `${result.ratio.toFixed(2)}:1 — ${result.where}`).toBe(true);
    },
  );

  it('red-pen on paper is not approved for body-size text', () => {
    const textUse = PAIRINGS.find(
      (p) => p.fg === 'red-pen' && p.bg === 'paper' && p.use === 'text',
    );
    expect(textUse).toBeUndefined();
    expect(contrastRatio(colors['red-pen'], colors.paper)).toBeLessThan(4.5);
  });
});

import type { Metadata } from 'next';
import { auditPairings, colors, space, typeScale } from '@jom/ui';

export const metadata: Metadata = {
  title: 'Token specimen',
  robots: { index: false, follow: false },
};

/** One-page visual reference for every design token (DESIGNING.md §8 Phase 0). */
export default function SpecimenPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-[68ch] bg-paper px-4 py-6 text-ink">
      <h1 className="border-b border-ink pb-2 font-display text-xl">Token specimen</h1>

      <section className="py-6">
        <h2 className="pb-3 font-display text-lg">Colour</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(colors).map(([name, hex]) => (
            <li key={name} className="border border-ink">
              <div className="h-16 border-b border-ink" style={{ background: `var(--${name})` }} />
              <p className="px-2 pt-1 text-sm">--{name}</p>
              <p className="px-2 pb-1 font-mono text-xs">{hex}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-dashed border-paper-shadow py-6">
        <h2 className="pb-3 font-display text-lg">Type scale</h2>
        {Object.entries(typeScale).map(([name, size]) => (
          <p key={name} className="leading-tight" style={{ fontSize: `var(--t-${name})` }}>
            <span className="font-mono text-xs">
              --t-{name} / {size}
            </span>{' '}
            <span className="font-display">Everyone dies on this level</span>
          </p>
        ))}
        <p className="pt-4 font-mono text-2xl text-red-pen">47,382</p>
        <p className="text-xs">The death number: 2xl, mono, red-pen — the one huge element.</p>
      </section>

      <section className="border-t border-dashed border-paper-shadow py-6">
        <h2 className="pb-3 font-display text-lg">Space</h2>
        {space.map((px, i) => (
          <div key={px} className="flex items-center gap-3 py-1">
            <span className="w-24 font-mono text-xs">--space-{i + 1}</span>
            <span className="h-3 bg-ink" style={{ width: `var(--space-${i + 1})` }} />
            <span className="font-mono text-xs">{px}px</span>
          </div>
        ))}
      </section>

      <section className="border-t border-dashed border-paper-shadow py-6">
        <h2 className="pb-3 font-display text-lg">Contrast</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th className="py-1 pr-3 font-semibold">Pair</th>
                <th className="py-1 pr-3 font-semibold">Ratio</th>
                <th className="py-1 pr-3 font-semibold">Use</th>
              </tr>
            </thead>
            <tbody>
              {auditPairings().map((r) => (
                <tr key={`${r.fg}-${r.bg}-${r.use}`} className="border-b border-paper-shadow">
                  <td className="py-1 pr-3">
                    <span
                      className="inline-block px-2 py-1"
                      style={{ color: `var(--${r.fg})`, background: `var(--${r.bg})` }}
                    >
                      {r.fg} on {r.bg}
                    </span>
                  </td>
                  <td className="py-1 pr-3 font-mono">{r.ratio.toFixed(2)}:1</td>
                  <td className="py-1 pr-3">{r.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

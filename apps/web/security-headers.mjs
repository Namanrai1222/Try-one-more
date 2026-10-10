/**
 * Baseline security headers (SECURITY.md §7, §11 Phase 0).
 *
 * The full CSP ships as REPORT-ONLY in Phase 0. Next.js App Router injects inline
 * scripts for hydration, so enforcing `script-src 'self'` today would break the site;
 * Phase 1 reviews the reports, adds per-request nonces, then enforces (SECURITY.md §11).
 * The directives that cannot break hydration are enforced now.
 *
 * Third-party origins (R2, Supabase, PostHog) are added only when those integrations
 * actually land. Colyseus landed in Phase 5: see `realtimeSources`.
 */

/**
 * The realtime (Colyseus) server's origin for `connect-src`, from NEXT_PUBLIC_REALTIME_URL.
 * Unset outside production, the local dev server is allowed.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function realtimeSources(env = process.env) {
  const url = env.NEXT_PUBLIC_REALTIME_URL;
  if (url) return [new URL(url).origin];
  return env.NODE_ENV === 'production' ? [] : ['ws://localhost:2567'];
}

/** @type {Record<string, string[]>} */
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'media-src': ["'self'", 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", ...realtimeSources()],
  'worker-src': ["'self'", 'blob:'],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'form-action': ["'self'"],
};

/** @param {Record<string, string[]>} directives */
export function buildCsp(directives = CSP_DIRECTIVES) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export const ENFORCED_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

/** @returns {{ key: string; value: string }[]} */
export function securityHeaders({ embedded = false } = {}) {
  // Only the submission entry can be embedded; the rest of the site stays protected.
  const ancestors = ["'self'", 'https://crazygames.com', 'https://*.crazygames.com'];
  return [
    {
      key: 'Content-Security-Policy',
      value: embedded
        ? `frame-ancestors ${ancestors.join(' ')}; base-uri 'self'; object-src 'none'`
        : ENFORCED_CSP,
    },
    {
      key: 'Content-Security-Policy-Report-Only',
      value: buildCsp(
        embedded
          ? {
              ...CSP_DIRECTIVES,
              'frame-ancestors': ancestors,
              'script-src': ["'self'", 'https://sdk.crazygames.com'],
              'connect-src': [...CSP_DIRECTIVES['connect-src'], 'https://*.crazygames.com'],
            }
          : CSP_DIRECTIVES,
      ),
    },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    ...(!embedded ? [{ key: 'X-Frame-Options', value: 'DENY' }] : []),
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ];
}

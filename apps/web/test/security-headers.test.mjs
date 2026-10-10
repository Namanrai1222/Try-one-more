import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, ENFORCED_CSP, buildCsp, securityHeaders } from '../security-headers.mjs';

const headers = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));

describe('security headers (SECURITY.md §7)', () => {
  it('sends every baseline header', () => {
    for (const key of [
      'Content-Security-Policy',
      'Content-Security-Policy-Report-Only',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(headers[key], key).toBeTruthy();
    }
  });

  it('enforces the directives that cannot break hydration', () => {
    expect(ENFORCED_CSP).toContain("frame-ancestors 'none'");
    expect(ENFORCED_CSP).toContain("object-src 'none'");
    expect(ENFORCED_CSP).toContain("base-uri 'self'");
  });

  it('never allows unsafe-inline or unsafe-eval scripts', () => {
    expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-inline'");
    expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-eval'");
    expect(buildCsp()).toMatch(/script-src 'self'(;|$)/);
  });

  it('denies camera, microphone, geolocation and payment', () => {
    expect(headers['Permissions-Policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
  });

  it('uses the two-year HSTS policy', () => {
    expect(headers['Strict-Transport-Security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('allows CrazyGames embedding only with the submission header profile', () => {
    const embedded = Object.fromEntries(
      securityHeaders({ embedded: true }).map((h) => [h.key, h.value]),
    );
    expect(embedded['X-Frame-Options']).toBeUndefined();
    expect(embedded['Content-Security-Policy']).toContain('https://*.crazygames.com');
    expect(embedded['Content-Security-Policy']).not.toContain("frame-ancestors 'none'");
    expect(headers['X-Frame-Options']).toBe('DENY');
  });
});

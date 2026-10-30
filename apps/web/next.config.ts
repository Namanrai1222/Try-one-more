import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers.mjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker builds a self-contained server (Dockerfile); local and CI builds stay as they are.
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  // SECURITY.md §4.4: no source maps in production.
  productionBrowserSourceMaps: false,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    '@jom/clip',
    '@jom/engine',
    '@jom/game-push-party',
    '@jom/game-rage',
    '@jom/platform-sdk',
    '@jom/ui',
  ],
  async headers() {
    return [
      { source: '/((?!crazygames(?:/|$)).*)', headers: securityHeaders() },
      { source: '/crazygames/:path*', headers: securityHeaders({ embedded: true }) },
    ];
  },
};

export default nextConfig;

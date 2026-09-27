import { colors } from '@jom/ui';
import type { MetadataRoute } from 'next';

/** Installable app (PRD.md Phase 6): the home screen opens the shell without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Just One More',
    short_name: 'Just One More',
    description: 'A game that lies to you, and makes you laugh while you lose.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: colors.paper,
    theme_color: colors.paper,
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

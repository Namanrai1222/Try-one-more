import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { colors } from '@jom/ui';
import { ServiceWorker } from './pwa';
import './globals.css';
import './desk.css';

export const metadata: Metadata = {
  title: { default: 'Just One More', template: '%s · Just One More' },
  description: 'A game that lies to you, and makes you laugh while you lose.',
  icons: { icon: '/icons/32', apple: '/icons/180' },
  appleWebApp: { capable: true, title: 'Just One More', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: colors.desk,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh bg-desk font-body text-desk-ink antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

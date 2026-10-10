import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('./'),
  base: './',
  publicDir: false,
  plugins: [
    {
      name: 'portable-fonts',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/app/globals.css')) return;
        return code.replaceAll(
          /url\('\/fonts\/([^']+)'\)/g,
          (_, font) => `url('${here(`../public/fonts/${font}`)}')`,
        );
      },
    },
  ],
  resolve: { alias: { 'next/link': here('./link.tsx') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  // Tailwind scans the same host/components as the Next.js build.
  css: { postcss: here('../') },
  build: { outDir: here('../dist/crazygames'), emptyOutDir: true, sourcemap: false },
});

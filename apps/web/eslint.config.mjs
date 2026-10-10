import jom from '@jom/config/eslint-plugin-jom';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { jom },
    rules: {
      // SECURITY.md §2 — server-only code and private env vars never reach client modules.
      'jom/no-server-imports-in-client': 'error',
      'jom/no-private-env-in-client': 'error',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'dist/**', 'next-env.d.ts', 'public/**']),
]);

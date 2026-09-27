import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import jom from '../eslint-plugin-jom.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

tester.run('no-server-imports-in-client', jom.rules['no-server-imports-in-client'], {
  valid: [
    // server modules may import server code freely
    "import 'server-only'; import { db } from '@/lib/server/db';",
    // client modules may import ordinary code
    "'use client'; import { useState } from 'react';",
    // a 'use client' string after the first statement is not a directive
    "import x from '@/lib/server/db'; 'use client';",
  ],
  invalid: [
    {
      code: "'use client'; import 'server-only';",
      errors: [{ messageId: 'serverImport' }],
    },
    {
      code: "'use client'; import { admin } from '@/lib/server/supabase-admin';",
      errors: [{ messageId: 'serverImport' }],
    },
    {
      code: "'use client'; export * from '../server/keys';",
      errors: [{ messageId: 'serverImport' }],
    },
    {
      code: "'use client'; const m = import('@/lib/server/db');",
      errors: [{ messageId: 'serverImport' }],
    },
    {
      code: "'use client'; import x from 'secret-admin';",
      options: [{ patterns: ['admin'] }],
      errors: [{ messageId: 'serverImport' }],
    },
  ],
});

tester.run('no-private-env-in-client', jom.rules['no-private-env-in-client'], {
  valid: [
    "'use client'; const u = process.env.NEXT_PUBLIC_SITE_URL;",
    "'use client'; const d = process.env.NODE_ENV;",
    // server modules are not restricted by this rule
    'const k = process.env.SUPABASE_SERVICE_ROLE_KEY;',
  ],
  invalid: [
    {
      code: "'use client'; const k = process.env.SUPABASE_SERVICE_ROLE_KEY;",
      errors: [{ messageId: 'privateEnv' }],
    },
    {
      code: "'use client'; const k = process.env['REDIS_TOKEN'];",
      errors: [{ messageId: 'privateEnv' }],
    },
    {
      code: "'use client'; const name = 'X'; const k = process.env[name];",
      errors: [{ messageId: 'dynamicEnv' }],
    },
  ],
});

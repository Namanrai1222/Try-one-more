// Local ESLint rules for Just One More.
//
// SECURITY.md §2: server-only code (service-role keys, admin clients) must never be
// importable from a client component. Next.js marks client modules with a leading
// 'use client' directive, so these rules only fire inside such files.

const DEFAULT_SERVER_PATTERNS = ['^server-only$', '(^|/)server(/|$)'];

/** @param {import('estree').Program} program */
function isClientModule(program) {
  for (const stmt of program.body) {
    if (stmt.type !== 'ExpressionStatement' || typeof stmt.directive !== 'string') break;
    if (stmt.directive === 'use client') return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const noServerImportsInClient = {
  meta: {
    type: 'problem',
    docs: { description: "Disallow server-only imports inside 'use client' modules" },
    schema: [
      {
        type: 'object',
        properties: { patterns: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      serverImport:
        "'{{source}}' is server-only and cannot be imported from a 'use client' module (SECURITY.md §2).",
    },
  },
  create(context) {
    const patterns = (context.options[0]?.patterns ?? DEFAULT_SERVER_PATTERNS).map(
      (p) => new RegExp(p),
    );
    let client = false;

    const check = (node, source) => {
      if (!client || !source || source.type !== 'Literal' || typeof source.value !== 'string') {
        return;
      }
      const value = source.value;
      if (patterns.some((re) => re.test(value))) {
        context.report({ node, messageId: 'serverImport', data: { source: value } });
      }
    };

    return {
      Program(node) {
        client = isClientModule(node);
      },
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noPrivateEnvInClient = {
  meta: {
    type: 'problem',
    docs: { description: "Only NEXT_PUBLIC_* env vars may be read inside 'use client' modules" },
    schema: [],
    messages: {
      privateEnv:
        'process.env.{{name}} is not public. Client modules may only read NEXT_PUBLIC_* variables (SECURITY.md §2).',
      dynamicEnv: "Dynamic process.env access is not allowed in 'use client' modules.",
    },
  },
  create(context) {
    let client = false;
    return {
      Program(node) {
        client = isClientModule(node);
      },
      MemberExpression(node) {
        if (!client) return;
        const obj = node.object;
        const isProcessEnv =
          obj.type === 'MemberExpression' &&
          !obj.computed &&
          obj.object.type === 'Identifier' &&
          obj.object.name === 'process' &&
          obj.property.type === 'Identifier' &&
          obj.property.name === 'env';
        if (!isProcessEnv) return;

        let name = null;
        if (!node.computed && node.property.type === 'Identifier') name = node.property.name;
        if (node.computed && node.property.type === 'Literal') name = String(node.property.value);

        if (name === null) {
          context.report({ node, messageId: 'dynamicEnv' });
        } else if (!name.startsWith('NEXT_PUBLIC_') && name !== 'NODE_ENV') {
          context.report({ node, messageId: 'privateEnv', data: { name } });
        }
      },
    };
  },
};

export default {
  meta: { name: 'eslint-plugin-jom' },
  rules: {
    'no-server-imports-in-client': noServerImportsInClient,
    'no-private-env-in-client': noPrivateEnvInClient,
  },
};

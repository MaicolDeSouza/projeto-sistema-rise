import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Client do Prisma: gerado por `prisma generate`, nunca editado a mao.
    "src/generated/**",
  ]),
  {
    rules: {
      // Constante usada no MESMO escopo antes da linha que a declara: em producao o React cai com "Cannot access 'x'
      // before initialization" e a pagina inteira some (26/10/2026: o Sincronizar da Loja Integrada derrubou /produtos).
      // `variables: false` deixa passar o uso dentro de funcao que so roda depois (clique), que e seguro.
      "no-use-before-define": ["error", { functions: false, classes: false, variables: false, allowNamedExports: true }],
    },
  },
]);

export default eslintConfig;

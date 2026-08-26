import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  },
  {
    ignores: [
      ".next/**",
      "output/**",
      "vendor/**",
      "vendor/**/dist/**",
      "vendor/**/node_modules/**",
      // The Next ESLint parser does not recognize ESM declaration files even
      // though TypeScript resolves them for sibling .mjs modules.
      "**/*.d.mts",
      // Agent worktrees are whole checkouts of this repo, build output and all.
      // Without these, `eslint .` lints their compiled .next chunks and reports
      // hundreds of errors against generated vendor code. Matches the exclusions
      // vitest.config.ts already applies for the same reason.
      "**/.claude/worktrees/**",
      "**/.worktrees/**"
    ]
  }
];

export default config;

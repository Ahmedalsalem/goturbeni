import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      "**/.next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Git worktrees for in-progress branches live here (see
      // using-git-worktrees) — each is a full separate checkout with its own
      // node_modules/.next, so linting them from the parent repo's `eslint .`
      // both double-lints the same source under a different branch and picks
      // up their stale build output (e.g. .next/**, which the pattern above
      // only catches when the worktree itself is excluded first).
      ".claude/worktrees/**",
    ],
  },
];

export default eslintConfig;

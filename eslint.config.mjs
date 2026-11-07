// Shared flat ESLint config. Workspace packages inherit it through upward lookup,
// so each package only needs a `"lint": "eslint ."` script.
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/target/**",
      "**/*.d.ts",
      "contracts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.es2025 } },
    rules: {
      // Amount math is bigint-only (BuildPlan.md §2, §11): never fall back to `Number` silently.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always"],
      "no-console": "off",
    },
  },
  prettier,
);

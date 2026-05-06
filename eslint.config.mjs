import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Stray prototype file at repo root — not imported anywhere.
    "chaos-mosaic-v3.jsx",
    // Generated Convex client code.
    "convex/_generated/**",
    // MCP server has its own tsconfig; let it lint itself separately.
    // Compiled output (dist) should never be linted.
    "mcp/**",
  ]),
  {
    rules: {
      // React Compiler preview rule. The React 19 canonical SSR-safe pattern
      // for reading browser-only state (localStorage, matchMedia, navigator)
      // is exactly `useEffect → setState`. Until the ecosystem settles on
      // useSyncExternalStore everywhere, keep this as a warning so it surfaces
      // new instances without blocking builds on the existing baseline.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Scope typed-linting to src/ — avoids roping in scripts/ and convex/
    // (which have separate or no tsconfigs) and keeps lint fast.
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Set to warn until the existing 77 sites can be audited individually —
      // mass-adding `void` would mask real bugs (click handlers that should
      // have been awaited) rather than verifying intent.
      "@typescript-eslint/no-floating-promises": "warn",
    },
  },
]);

export default eslintConfig;

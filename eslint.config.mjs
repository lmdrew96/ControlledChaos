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
]);

export default eslintConfig;

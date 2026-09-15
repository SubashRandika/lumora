import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The domain layer must stay renderer-agnostic so it can drive other
    // front-ends (voice, AR) and be tested without a DOM or WebGL.
    files: ["src/domain/**/*.ts", "src/data/**/*.ts", "src/config/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*"],
              message: "Domain code must not depend on React/Next.",
            },
            {
              group: ["three", "three/*", "@react-three/*"],
              message: "Domain code must not depend on the 3D layer.",
            },
            {
              group: ["@/components/*", "@/three/*", "@/stores/*"],
              message: "Domain code must not import from outer layers.",
            },
          ],
        },
      ],
    },
  },
  {
    // Three.js is large. Only the 3D layer may import it statically; everything
    // else reaches the chamber through a dynamic import(), so pages that don't
    // show 3D never download it. Type-only imports are fine (erased at build).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/three/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "three",
                "three/*",
                "@react-three/*",
                "postprocessing",
                "gsap",
                "gsap/*",
                "@/three/*",
              ],
              message:
                "Import 3D code only inside src/three, or load it with a dynamic import().",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;

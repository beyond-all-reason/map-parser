// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: ["**/dist", "**/working-files"]
    },
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        plugins: {
            "unused-imports": unusedImports,
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            semi: ["error", "always"],
            quotes: ["error", "double"],
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            "@typescript-eslint/no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",

            "key-spacing": ["error", {
                beforeColon: false,
                afterColon: true,
            }],

            curly: "error",
            eqeqeq: "error",
            "brace-style": "error",
            "keyword-spacing": "error",
            "comma-spacing": "error",
            "block-spacing": "error",
            "no-trailing-spaces": "error",
            "space-before-blocks": "error",
            indent: ["error", 4],
        }
    }
);

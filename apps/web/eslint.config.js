import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    name: "web/generated-test-artifacts",
    ignores: ["lib/pdf/.test-tmp/**"],
  },
  ...nextJsConfig,
];

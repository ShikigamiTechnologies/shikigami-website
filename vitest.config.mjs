import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_CYPHER_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations/cypher")),
          CYPHER_AUTH_PEPPER: "integration-test-pepper",
          PLATFORM_AUTH_PEPPER: "platform-integration-test-pepper",
        },
      },
    })),
  ],
  test: { include: ["tests/**/*.test.js"], sequence: { concurrent: false } },
});

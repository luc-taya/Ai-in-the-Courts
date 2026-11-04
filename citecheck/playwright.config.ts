/**
 * Browser tests (npm run e2e). They run against the Vite dev server, never a build, with the index files
 * replaced by the synthetic fixture in e2e/fixtures, so no real index is needed (e2e/network.ts).
 * Test files end in .e2e.ts, so Vitest does not pick them up.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 4317;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test-results",
  reporter: "list",
  workers: 1, // one at a time, so the timing test does not share the machine with another test
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { baseURL: `${ORIGIN}/citecheck/`, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config e2e/dev-server.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${ORIGIN}/citecheck/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

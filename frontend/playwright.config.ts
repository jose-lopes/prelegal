import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run start -- --hostname 0.0.0.0", url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 60_000 },
});

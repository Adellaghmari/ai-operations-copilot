import { defineConfig } from "@playwright/test";

const liveDemoUrl = process.env.LIVE_DEMO_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: liveDemoUrl ? 300_000 : 120_000,
  workers: liveDemoUrl ? 1 : undefined,
  use: {
    baseURL: liveDemoUrl || "http://localhost:5173",
  },
  webServer: liveDemoUrl
    ? undefined
    : {
        command: "npm run dev",
        port: 5173,
        reuseExistingServer: true,
      },
});

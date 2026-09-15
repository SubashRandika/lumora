import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Headless Chromium has no GPU. SwiftShader gives it a software WebGL 2 so the
 * chamber can render in tests (slowly, and detected as the low tier).
 */
const SOFTWARE_WEBGL = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    launchOptions: { args: SOFTWARE_WEBGL },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { args: SOFTWARE_WEBGL } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], launchOptions: { args: SOFTWARE_WEBGL } },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});

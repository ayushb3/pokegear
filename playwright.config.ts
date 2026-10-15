import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4399); // override locally (E2E_PORT) if another worktree is using it

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // CI: one retry so a timing flake is reported as flaky instead of failing the PR.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'test-results',
  use: { baseURL: `http://localhost:${PORT}` },
  // astro build + foreground static server on its own port (does not touch the dev server on :4321).
  // scripts/e2e-server.mjs builds dist/ (skip with E2E_SKIP_BUILD=1) then serves it in-process,
  // so the process never exits early the way `astro preview` (which daemonizes) used to.
  webServer: {
    command: `node scripts/e2e-server.mjs`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { E2E_PORT: String(PORT) },
  },
  projects: [
    { name: 'phone-375x812', use: { browserName: 'chromium', viewport: { width: 375, height: 812 } } },
    { name: 'desktop-1440x900', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});

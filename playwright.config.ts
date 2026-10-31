import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  workers: 1,
  reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:8798', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'node ../node_modules/wrangler/bin/wrangler.js dev --port 8798 --local',
    cwd: 'worker',
    url: 'http://127.0.0.1:8798/api/rates',
    reuseExistingServer: false,
    timeout: 90000,
  },
});

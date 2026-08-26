import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

// The production site is served from https://sholtomaud.github.io/gssk-dia/, i.e.
// under a non-root base path. A second preview server reproduces that prefix so
// pages_subpath.spec.js can catch root-absolute asset URLs, which resolve against
// the domain root and 404 in production while working perfectly at "/".
export const SUBPATH_BASE = '/gssk-dia/';
export const SUBPATH_PORT = 4174;
export const SUBPATH_URL = `http://localhost:${SUBPATH_PORT}${SUBPATH_BASE}`;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: CI ? 'http://localhost:4173' : 'http://localhost:5173',
  },
  webServer: [
    {
      command: CI ? 'npm run preview' : 'npm run dev',
      url: CI ? 'http://localhost:4173' : 'http://localhost:5173',
      reuseExistingServer: !CI,
    },
    {
      // Serves the built dist/ under SUBPATH_BASE. Requires `npm run build`
      // first — `make test` depends on `make build` for exactly this reason.
      command: `npx vite preview --base ${SUBPATH_BASE} --port ${SUBPATH_PORT} --strictPort`,
      url: SUBPATH_URL,
      reuseExistingServer: !CI,
    },
  ],
});

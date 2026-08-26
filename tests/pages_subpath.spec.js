import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SUBPATH_URL } from '../playwright.config.js';

// Regression test for issue #52: the deployed site was blank because the raw
// repo root was published instead of the Vite build. Two failure modes are
// pinned here, both invisible when the app is served from "/":
//   1. root-absolute asset URLs ("/src/gssk-editor.js") resolve against the
//      domain root rather than the /gssk-dia/ prefix, and 404;
//   2. bare module specifiers ("gssk", "zod", ...) that only Vite can resolve.
test('built app loads under a non-root base path with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) =>
    errors.push(`requestfailed: ${req.url()} — ${req.failure()?.errorText}`)
  );

  const response = await page.goto(SUBPATH_URL, { waitUntil: 'load' });
  expect(response?.status()).toBe(200);

  // The custom element only upgrades if its module actually resolved and ran.
  await page.waitForFunction(
    () => document.querySelector('gssk-editor')?.shadowRoot != null
  );
  const hasShadowRoot = await page.evaluate(
    () => document.querySelector('gssk-editor').shadowRoot != null
  );
  expect(hasShadowRoot).toBe(true);

  expect(errors).toEqual([]);
});

test('built index.html carries no root-absolute asset URLs', async ({ page }) => {
  const response = await page.goto(SUBPATH_URL, { waitUntil: 'load' });
  const html = await response.text();
  const rootAbsolute = [...html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
  expect(rootAbsolute).toEqual([]);
});

// The built output is not enough on its own: Vite happily resolves a
// root-absolute src at build time and inlines it into the bundle, so the
// defect is invisible in dist/. Pin it at the source instead.
test('source index.html carries no root-absolute asset URLs', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const rootAbsolute = [...html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
  expect(rootAbsolute).toEqual([]);
});

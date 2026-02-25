
import { test, expect } from '@playwright/test';

test('should NOT produce NaN in polyline points with isolated storage node and should log warning', async ({ page }) => {
  const errors = [];
  const logs = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/');

  // Create a model with an isolated storage node
  await page.evaluate(() => {
    const editor = document.getElementById('editor');
    editor.loadModel({
      config: { dt: 0.1, t_start: 0, t_end: 1, method: 'euler' },
      nodes: [
        { id: 'isolated_storage', type: 'storage', value: 10, visual: { x: 100, y: 100, label: 'Isolated', capacity: 100 } }
      ],
      edges: []
    });
  });

  // Run the simulation
  await page.click('#run-sim');

  // Wait for simulation to finish
  await page.waitForTimeout(1000);

  // Check that we DO NOT have the specific SVG error
  const hasPolylineError = errors.some(e => e.includes('<polyline> attribute points: Expected number'));
  expect(hasPolylineError).toBe(false);

  // Check that the critical error was logged to the UI console
  const logContent = await page.textContent('#log-console');
  expect(logContent).toContain("CRITICAL ERROR: Storage node 'isolated_storage' is defined in the editor but missing from simulation kernel state.");
});

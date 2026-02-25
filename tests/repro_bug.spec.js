
import { test, expect } from '@playwright/test';

test('should NOT produce missing node error with isolated storage node', async ({ page }) => {
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
  await page.waitForTimeout(500);

  // Check that the critical error was NOT logged
  const logContent = await page.textContent('#log-console');
  expect(logContent).not.toContain("CRITICAL ERROR");
});

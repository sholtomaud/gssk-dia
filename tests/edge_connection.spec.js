import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => customElements.get('gssk-editor'));
});

test('should create an edge when dragging from port to node', async ({ page }) => {
  const editor = page.locator('gssk-editor');

  // Find the position of a port on the 'sun' node
  const startPos = await editor.evaluate((el) => {
    const node = el.shadowRoot.querySelector('.node-group[data-id="sun"]');
    const port = node.querySelector('.node-port[data-pos="right"]');
    const rect = port.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  // Find the position of the 'grass' node
  const endPos = await editor.evaluate((el) => {
    const node = el.shadowRoot.querySelector('.node-group[data-id="grass"]');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  const initialEdgeCount = await editor.evaluate((el) => el.getJson().edges.length);
  console.log('Initial edge count:', initialEdgeCount);

  await page.mouse.move(startPos.x, startPos.y);
  await page.mouse.down();
  await page.mouse.move(endPos.x, endPos.y);
  await page.mouse.up();

  const finalEdgeCount = await editor.evaluate((el) => el.getJson().edges.length);
  console.log('Final edge count:', finalEdgeCount);

  expect(finalEdgeCount).toBe(initialEdgeCount + 1);
});

test('should NOT delete node when pressing Backspace in an input field', async ({ page }) => {
  const editor = page.locator('gssk-editor');

  // Select a node to show property panel
  await editor.evaluate((el) => {
      const node = el.shadowRoot.querySelector('.node-group[data-id="grass"]');
      const svg = el.shadowRoot.getElementById('svg-canvas');
      const rect = node.getBoundingClientRect();
      const pt = svg.createSVGPoint();
      pt.x = rect.left + rect.width / 2;
      pt.y = rect.top + rect.height / 2;

      const event = new MouseEvent('mousedown', {
          bubbles: true,
          clientX: pt.x,
          clientY: pt.y
      });
      node.querySelector('rect').dispatchEvent(event);
  });

  // Check if panel is visible
  const panel = editor.locator('#property-panel');
  await expect(panel).not.toHaveClass(/hidden/);

  const labelInput = editor.locator('#prop-label');
  await expect(labelInput).toBeVisible();

  const initialNodeCount = await editor.evaluate((el) => el.getJson().nodes.length);

  await labelInput.click();
  await page.keyboard.press('Backspace');

  const finalNodeCount = await editor.evaluate((el) => el.getJson().nodes.length);
  expect(finalNodeCount).toBe(initialNodeCount);
});

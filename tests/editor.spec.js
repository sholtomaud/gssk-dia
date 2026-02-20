import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => customElements.get('gssk-editor'));
});

test('should render initial nodes and edges', async ({ page }) => {
  const editor = page.locator('gssk-editor');
  await expect(editor).toBeVisible();

  await expect(async () => {
    const nodeCount = await editor.evaluate((el) => el.shadowRoot?.querySelectorAll('.node-group').length);
    expect(nodeCount).toBe(3);
  }).toPass();

  const edgeCount = await editor.evaluate((el) => el.shadowRoot.querySelectorAll('#edges-layer g').length);
  expect(edgeCount).toBe(2);
});

test('should drag a node and update model', async ({ page }) => {
  const editor = page.locator('gssk-editor');

  const startPos = await editor.evaluate((el) => {
    const svg = el.shadowRoot.getElementById('svg-canvas');
    const pt = svg.createSVGPoint();
    pt.x = 300;
    pt.y = 150;
    const screenP = pt.matrixTransform(svg.getScreenCTM());
    return { x: screenP.x, y: screenP.y };
  });

  const endPos = await editor.evaluate((el) => {
    const svg = el.shadowRoot.getElementById('svg-canvas');
    const pt = svg.createSVGPoint();
    pt.x = 400;
    pt.y = 200;
    const screenP = pt.matrixTransform(svg.getScreenCTM());
    return { x: screenP.x, y: screenP.y };
  });

  await page.mouse.move(startPos.x, startPos.y);
  await page.mouse.down();
  await page.mouse.move(endPos.x, endPos.y);
  await page.mouse.up();

  const finalPos = await editor.evaluate((el) => {
    const node = el.getJson().nodes.find(n => n.id === 'grass');
    return { x: node.visual.x, y: node.visual.y };
  });

  expect(finalPos.x).toBe(400);
  expect(finalPos.y).toBe(200);
});

test('should add a new node from palette', async ({ page }) => {
  const editor = page.locator('gssk-editor');
  const sourceItem = editor.locator('.palette-item[data-type="source"]');

  const initialNodeCount = await editor.evaluate((el) => el.getJson().nodes.length);

  const sourceBox = await sourceItem.boundingBox();
  const dropPos = await editor.evaluate((el) => {
      const svg = el.shadowRoot.getElementById('svg-canvas');
      const pt = svg.createSVGPoint();
      pt.x = 100;
      pt.y = 300;
      const screenP = pt.matrixTransform(svg.getScreenCTM());
      return { x: screenP.x, y: screenP.y };
  });

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropPos.x, dropPos.y);
  await page.mouse.up();

  const finalNodeCount = await editor.evaluate((el) => el.getJson().nodes.length);
  expect(finalNodeCount).toBe(initialNodeCount + 1);
});

test('should update state and visuals', async ({ page }) => {
  const editor = page.locator('gssk-editor');

  await editor.evaluate((el) => {
    el.updateState(new Float64Array([0, 100, 0]));
  });

  await page.waitForTimeout(100);

  const fillHeight = await editor.evaluate((el) => {
    const fill = el.shadowRoot.querySelector('#fill-grass');
    return parseFloat(fill.getAttribute('height'));
  });

  expect(fillHeight).toBe(60);
});

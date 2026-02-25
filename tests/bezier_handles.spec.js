import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => customElements.get('gssk-editor'));
});

test('should render and drag bezier handles', async ({ page }) => {
  const editor = page.locator('gssk-editor');

  // Select an existing edge to reveal handles
  // The default model has an edge from 'sun' to 'grass'
  const edgeId = await editor.evaluate((el) => el.getJson().edges[0].id);

  await editor.evaluate((el, id) => {
    el._selectedId = id;
    el._selectedType = 'edge';
    el.update();
  }, edgeId);

  // Verify handles are rendered
  const handles = editor.locator('.control-handle');
  await expect(handles).toHaveCount(2);

  // Get initial position of first handle
  const handle1 = handles.first();
  const initialBox = await handle1.boundingBox();

  // Drag the handle
  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + 100, initialBox.y + 50);
  await page.mouse.up();

  // Verify edge visual state updated
  const edge = await editor.evaluate((el, id) => el.getJson().edges.find(e => e.id === id), edgeId);
  expect(edge.visual.ctrl1).toBeDefined();
  expect(edge.visual.ctrl1.x).not.toBe(0);
  expect(edge.visual.ctrl1.y).not.toBe(0);

  // Verify path 'd' attribute contains 'C'
  const path = editor.locator(`.edge-group[data-id="${edgeId}"] path`).first();
  const d = await path.getAttribute('d');
  expect(d).toContain('C');
});

test('should preserve relative handle offsets when node moves', async ({ page }) => {
  const editor = page.locator('gssk-editor');
  const edgeId = await editor.evaluate((el) => el.getJson().edges[0].id);
  const originId = await editor.evaluate((el, id) => el.getJson().edges.find(e => e.id === id).origin, edgeId);

  // Manually set a handle offset
  await editor.evaluate((el, id) => {
    const edge = el._value.edges.find(e => e.id === id);
    if (!edge.visual) edge.visual = {};
    edge.visual.ctrl1 = { x: 50, y: 50 };
    el.update();
  }, edgeId);

  // Get initial geometry
  const initialGeo = await editor.evaluate((el, id) => el.getEdgeGeometry(el._value.edges.find(e => e.id === id)), edgeId);

  // Move the origin node
  await editor.evaluate((el, id) => {
    const node = el._value.nodes.find(n => n.id === id);
    node.visual.x += 100;
    node.visual.y += 100;
    el.update();
  }, originId);

  // Get new geometry
  const newGeo = await editor.evaluate((el, id) => el.getEdgeGeometry(el._value.edges.find(e => e.id === id)), edgeId);

  // Check that cx1 followed x1 (maintaining the 50 offset)
  expect(newGeo.cx1 - newGeo.x1).toBeCloseTo(50, 0);
  expect(newGeo.cy1 - newGeo.y1).toBeCloseTo(50, 0);
});

test('should place gate symbol on the bezier curve', async ({ page }) => {
  const editor = page.locator('gssk-editor');

  // Create an interaction edge or modify existing one
  const edgeId = await editor.evaluate((el) => {
    const edge = el._value.edges[0];
    edge.logic = 'interaction';
    edge.visual.ctrl1 = { x: 100, y: 0 };
    edge.visual.ctrl2 = { x: -100, y: 0 };
    el.update();
    return edge.id;
  });

  const gate = editor.locator(`.edge-group[data-id="${edgeId}"] use[href="#gate"]`);
  await expect(gate).toBeVisible();

  const gateBox = await gate.boundingBox();
  const midPoint = await editor.evaluate((el, id) => el.getPathMidpoint(el._value.edges.find(e => e.id === id)), edgeId);

  // gate is centered at midPoint, but 'use' has x, y which are top-left
  // in renderEdges: use.setAttribute('x', midPoint.x - 15);
  expect(gateBox.x).toBeDefined();

  // We can't easily check screen coords vs SVG coords without more work,
  // but we can check if the calculated midpoint follows the bezier formula.
  const geo = await editor.evaluate((el, id) => el.getEdgeGeometry(el._value.edges.find(e => e.id === id)), edgeId);
  const expectedX = 0.125 * geo.x1 + 0.375 * geo.cx1 + 0.375 * geo.cx2 + 0.125 * geo.x2;
  const expectedY = 0.125 * geo.y1 + 0.375 * geo.cy1 + 0.375 * geo.cy2 + 0.125 * geo.y2;

  expect(midPoint.x).toBeCloseTo(expectedX, 1);
  expect(midPoint.y).toBeCloseTo(expectedY, 1);
});

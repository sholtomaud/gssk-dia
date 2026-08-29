import { test, expect } from '@playwright/test';

// The twelve symbols of the Odum (1983) energy-systems language, as translated
// from tikz-odum.sty. The four originals plus the eight added here.
const ODUM_TYPES = [
  'source', 'storage', 'sink', 'constant',
  'interaction', 'transaction', 'producer', 'consumer',
  'switch', 'receiver', 'amplifier', 'box',
];

test.describe('Odum symbol vocabulary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('palette offers every symbol, each labelled and drawn', async ({ page }) => {
    const items = await page.locator('gssk-editor').evaluate((el) =>
      [...el.shadowRoot.querySelectorAll('.palette-item')].map((n) => ({
        type: n.dataset.type,
        label: n.querySelector('span')?.textContent?.trim() ?? '',
        hasSvg: !!n.querySelector('svg'),
      }))
    );

    // The palette also carries a System Boundary tool. It is deliberately not
    // an Odum node type — handleDrop() routes it into model.boundaries[] — so
    // it is asserted separately rather than folded into ODUM_TYPES.
    const nodeTypes = items.map((i) => i.type).filter((t) => t !== 'boundary');
    expect(nodeTypes.sort()).toEqual([...ODUM_TYPES].sort());
    expect(items.map((i) => i.type)).toContain('boundary');
    // A palette tile with no glyph or no caption is indistinguishable from its
    // neighbours, which is the whole point of the symbol language.
    expect(items.filter((i) => !i.hasSvg)).toEqual([]);
    expect(items.filter((i) => !i.label)).toEqual([]);
  });

  test('schema accepts every symbol as a node type', async ({ page }) => {
    const editor = page.locator('gssk-editor');

    await editor.evaluate((el, types) => {
      el.loadModel({
        config: { dt: 0.1, t_start: 0, t_end: 1, method: 'euler' },
        nodes: types.map((type, i) => ({
          id: `n_${type}`,
          type,
          value: 1,
          visual: { x: 60 + i * 40, y: 80, label: type },
        })),
        edges: [],
      });
    }, ODUM_TYPES);

    await expect(editor).not.toHaveAttribute('invalid');
    await expect(page.locator('#log-console')).toContainText('Model configuration is valid.');
  });

  test('schema still rejects a type outside the vocabulary', async ({ page }) => {
    const editor = page.locator('gssk-editor');

    await editor.evaluate((el) => {
      const json = el.getJson();
      json.nodes[0].type = 'flux_capacitor';
      el.loadModel(json);
    });

    await expect(editor).toHaveAttribute('invalid', '');
    await expect(page.locator('#log-console')).toContainText('Model Validation Error:');
  });

  test('a model built from the new symbols simulates without kernel errors', async ({ page }) => {
    const editor = page.locator('gssk-editor');

    // producer -> consumer -> sink exercises the kernel type mapping: the new
    // visual types have to map onto kernel primitives, and a mapping that drops
    // a node shows up here as a missing-state error rather than a bad drawing.
    await editor.evaluate((el) => {
      el.loadModel({
        config: { dt: 0.1, t_start: 0, t_end: 2, method: 'euler' },
        nodes: [
          { id: 'prod', type: 'producer', value: 10, visual: { x: 100, y: 100, label: 'Producer' } },
          { id: 'cons', type: 'consumer', value: 5, visual: { x: 250, y: 100, label: 'Consumer', capacity: 100 } },
          { id: 'heat', type: 'sink', value: 0, visual: { x: 400, y: 100, label: 'Sink' } },
        ],
        edges: [
          { id: 'e1', origin: 'prod', target: 'cons', logic: 'linear', params: { k: 0.2 } },
          { id: 'e2', origin: 'cons', target: 'heat', logic: 'linear', params: { k: 0.1 } },
        ],
      });
    });

    await expect(editor).not.toHaveAttribute('invalid');
    await page.click('#run-sim');
    await page.waitForTimeout(500);

    const log = await page.textContent('#log-console');
    expect(log).not.toContain('CRITICAL ERROR');
    expect(log).not.toContain('Kernel initialization failed');
  });
});

test.describe('System boundary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Regression test for a boundary dropped from the palette. A boundary is a
  // diagram region, so it belongs in model.boundaries[] and must never reach
  // the kernel; pushing one into model.nodes[] instead fails schema validation
  // and takes the whole model down with it.
  test('dropping a boundary adds a region, not a node', async ({ page }) => {
    const editor = page.locator('gssk-editor');

    const before = await editor.evaluate((el) => el.getJson().nodes.length);

    await editor.evaluate((el) => {
      const svg = el.shadowRoot.getElementById('svg-canvas');
      const dt = new DataTransfer();
      dt.setData('type', 'boundary');
      svg.dispatchEvent(new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true, clientX: 300, clientY: 250,
      }));
    });

    const model = await editor.evaluate((el) => el.getJson());
    expect(model.boundaries.length).toBe(1);
    expect(model.boundaries[0]).toMatchObject({ w: 200, h: 200 });
    expect(model.nodes.length).toBe(before);
    expect(model.nodes.some((n) => n.type === 'boundary')).toBe(false);

    await expect(editor).not.toHaveAttribute('invalid');
    await expect(page.locator('#log-console')).not.toContainText('Model Validation Error:');

    const drawn = await editor.evaluate(
      (el) => el.shadowRoot.querySelectorAll('#boundaries-layer .boundary-group').length
    );
    expect(drawn).toBe(1);
  });

  test('a model with a boundary still simulates', async ({ page }) => {
    const editor = page.locator('gssk-editor');

    await editor.evaluate((el) => {
      const json = el.getJson();
      json.boundaries = [{ id: 'b1', x: 50, y: 50, w: 300, h: 200, label: 'System' }];
      el.loadModel(json);
    });

    await expect(editor).not.toHaveAttribute('invalid');
    await page.click('#run-sim');
    await page.waitForTimeout(500);

    const log = await page.textContent('#log-console');
    expect(log).not.toContain('CRITICAL ERROR');
    expect(log).not.toContain('Kernel initialization failed');
  });
});

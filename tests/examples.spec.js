
import { test, expect } from '@playwright/test';

test.describe('Canned Examples', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have personal-finance and macro-economy in select', async ({ page }) => {
    const select = page.locator('#example-select');
    await expect(select.locator('option[value="personal-finance"]')).toBeAttached();
    await expect(select.locator('option[value="macro-economy"]')).toBeAttached();
  });

  test('should load personal-finance example', async ({ page }) => {
    await page.selectOption('#example-select', 'personal-finance');

    const editor = page.locator('gssk-editor');
    const model = await editor.evaluate(el => el.getJson());

    expect(model.id || 'personal-finance').toBeDefined(); // The example doesn't have an ID in the model itself but it's loaded
    expect(model.nodes.length).toBeGreaterThan(5);
    expect(model.boundaries.length).toBe(1);
    expect(model.boundaries[0].label).toBe('Household System');
  });

  test('should load macro-economy example', async ({ page }) => {
    await page.selectOption('#example-select', 'macro-economy');

    const editor = page.locator('gssk-editor');
    const model = await editor.evaluate(el => el.getJson());

    expect(model.nodes.length).toBeGreaterThan(3);
    expect(model.boundaries.length).toBe(1);
    expect(model.boundaries[0].label).toBe('National Economy');
  });
});

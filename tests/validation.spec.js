import { test, expect } from '@playwright/test';

test.describe('Model Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show validation errors in console and UI', async ({ page }) => {
    const editor = page.locator('gssk-editor');

    // Make the model invalid by removing a required field from a node
    await editor.evaluate((el) => {
        const json = el.getJson();
        delete json.nodes[0].type; // type is required
        el.loadModel(json);
    });

    // Check for invalid attribute on editor
    await expect(editor).toHaveAttribute('invalid', '');

    // Check for error message in log console
    const logConsole = page.locator('#log-console');
    await expect(logConsole).toContainText('Model Validation Error:');
    await expect(logConsole).toContainText("must have required property 'type'");

    // Make it valid again
    await editor.evaluate((el) => {
        const json = el.getJson();
        json.nodes[0].type = 'source';
        el.loadModel(json);
    });

    await expect(editor).not.toHaveAttribute('invalid');
    await expect(logConsole).toContainText('Model configuration is valid.');
  });

  test('should validate control_node in params', async ({ page }) => {
      await page.selectOption('#example-select', 'macro-economy');
      const editor = page.locator('gssk-editor');

      // Check if the loaded example is valid
      await expect(editor).not.toHaveAttribute('invalid');

      // Check that control_node is in params
      const model = await editor.evaluate(el => el.getJson());
      const interactionEdge = model.edges.find(e => e.logic === 'interaction');
      expect(interactionEdge.params.control_node).toBeDefined();
  });
});

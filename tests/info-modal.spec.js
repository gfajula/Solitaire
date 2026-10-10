const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('info button opens the How to play modal', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    // Modal hidden by default
    expect(await page.locator('#info-overlay').evaluate(el => el.classList.contains('hidden'))).toBe(true);

    // Old floating .infoDiv must NOT exist anymore
    expect(await page.locator('.infoDiv').count()).toBe(0);

    await page.locator('#info-btn').click();

    expect(await page.locator('#info-overlay').evaluate(el => el.classList.contains('hidden'))).toBe(false);

    await expect(page.locator('#info-title')).toHaveText('How to play');
    await expect(page.locator('.info-body')).toContainText('Keyboard');

    // The device/capability table still renders, folded under Device info.
    const content = await page.locator('#info-content').textContent();
    expect(content).toContain('Viewport');
    expect(content).toContain('Orientation');

    await page.locator('#info-close').click();
    expect(await page.locator('#info-overlay').evaluate(el => el.classList.contains('hidden'))).toBe(true);
});

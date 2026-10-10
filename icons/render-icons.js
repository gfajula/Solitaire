// One-shot icon renderer: SVG -> PNG via Playwright chromium.
// Run: node icons/render-icons.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const jobs = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512 },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const job of jobs) {
    const svg = fs.readFileSync(path.join(dir, job.svg), 'utf8')
      .replace(/width="512"/, `width="${job.size}"`)
      .replace(/height="512"/, `height="${job.size}"`);
    await page.setViewportSize({ width: job.size, height: job.size });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>${svg}`);
    await page.locator('svg').screenshot({ path: path.join(dir, job.out), omitBackground: true });
    console.log(`rendered ${job.out} (${job.size}px)`);
  }
  await browser.close();
})();

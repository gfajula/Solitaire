// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    fullyParallel: false,
    // One worker: several specs assert on animation timing.
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    // CI uploads playwright-report/ when a job fails, so it needs the HTML reporter.
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    use: {
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
        trace: 'off',
    },
    projects: [
        { name: 'w320',  use: { ...devices['Desktop Chrome'], viewport: { width: 320,  height: 640  } } },
        { name: 'w360',  use: { ...devices['Desktop Chrome'], viewport: { width: 360,  height: 740  } } },
        { name: 'w414',  use: { ...devices['Desktop Chrome'], viewport: { width: 414,  height: 896  } } },
        { name: 'w480',  use: { ...devices['Desktop Chrome'], viewport: { width: 480,  height: 800  } } },
        { name: 'w600',  use: { ...devices['Desktop Chrome'], viewport: { width: 600,  height: 900  } } },
        { name: 'w768',  use: { ...devices['Desktop Chrome'], viewport: { width: 768,  height: 1024 } } },
        { name: 'w900',  use: { ...devices['Desktop Chrome'], viewport: { width: 900,  height: 1000 } } },
        { name: 'w1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800  } } },
        { name: 'w1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900  } } },
        { name: 'w1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    ],
});

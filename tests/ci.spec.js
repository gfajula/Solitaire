// CI runs one job per Playwright project. A project added to the config but
// not to the workflow matrix would silently never run on CI.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const config = require('../playwright.config.js');

test('the CI matrix lists every Playwright project', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');
    const line = workflow.match(/^\s*project:\s*\[([^\]]+)\]/m);
    expect(line, 'matrix.project missing from ci.yml').not.toBeNull();

    const matrix = line[1].split(',').map(s => s.trim()).sort();
    const projects = config.projects.map(p => p.name).sort();
    expect(matrix).toEqual(projects);
});

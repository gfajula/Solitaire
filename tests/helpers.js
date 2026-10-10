const path = require('path');
const { pathToFileURL } = require('url');

// Portable file:// URL to index.html — works for any checkout location / CI.
const indexUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

module.exports = { indexUrl };

const fetch = require('node-fetch');

// All BBC audio APIs and CDN streams work from US IPs without a proxy.
// This module is kept as a thin wrapper in case future endpoints require routing changes.
async function directFetch(url, options = {}) {
  return fetch(url, { ...options, timeout: 15000 });
}

module.exports = { directFetch };

const express = require('express');
const { getLiveStreamUrl, getEpisodeStreamUrl } = require('../lib/bbc');

const router = express.Router();

// Live stream: redirect to worldwide Akamai HLS (no proxy needed)
router.get('/live/:service', (req, res) => {
  const url = getLiveStreamUrl(req.params.service);
  res.redirect(302, url);
});

// On-demand episode: fetch MediaSelector from BBC (also worldwide), return the stream URL.
// The client (HLS.js) fetches directly from Akamai — no segment proxying needed.
router.get('/episode/:id', async (req, res) => {
  try {
    const streamUrl = await getEpisodeStreamUrl(req.params.id);
    res.json({ streamUrl });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;

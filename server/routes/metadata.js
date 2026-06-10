const express = require('express');
const { getNowPlaying } = require('../lib/bbc');

const router = express.Router();

router.get('/nowplaying/:service?', async (req, res) => {
  const service = req.params.service || 'bbc_radio_one';
  const data = await getNowPlaying(service);
  if (!data) return res.status(502).json({ error: 'Could not fetch now-playing data' });
  res.json(data);
});

module.exports = router;

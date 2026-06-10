const express = require('express');
const { getShows, getEpisodes, getEpisodeDetail } = require('../lib/bbc');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const shows = await getShows();
    res.json({ shows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/episodes', async (req, res) => {
  try {
    const data = await getEpisodes(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.message === 'Show not found') return res.status(404).json({ error: 'Show not found' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:showId/episodes/:episodeId', async (req, res) => {
  try {
    const data = await getEpisodeDetail(req.params.showId, req.params.episodeId);
    res.json(data);
  } catch (err) {
    if (err.message === 'Show not found' || err.message === 'Episode not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

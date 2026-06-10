require('dotenv').config();
const express = require('express');
const path = require('path');

const showsRouter = require('./routes/shows');
const streamRouter = require('./routes/stream');
const metadataRouter = require('./routes/metadata');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/shows', showsRouter);
app.use('/api/stream', streamRouter);
app.use('/api/metadata', metadataRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Astral Rhythm running on http://localhost:${PORT}`);
});

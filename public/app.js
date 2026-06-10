/* Astral Rhythm — main app */
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  shows: [],
  currentShow: null,
  currentEpisode: null,
  view: 'shows', // 'shows' | 'episodes' | 'episode'
  player: {
    isPlaying: false,
    isLive: false,
    currentEpisodeId: null,
    title: '',
    show: '',
    image: '',
  },
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const audioEl = $('audioEl');
const playerBar = $('playerBar');
const playPauseBtn = $('playPauseBtn');
const seekBar = $('seekBar');
const progressFill = $('progressFill');
const playerTrack = $('playerTrack');
const playerShow = $('playerShow');
const playerArtImg = $('playerArtImg');
const playerTime = $('playerTime');
const skipBackBtn = $('skipBackBtn');
const skipFwdBtn = $('skipFwdBtn');
const backBtn = $('backBtn');
const pageTitle = $('pageTitle');

let hls = null;
let nowPlayingTimer = null;

// ── HLS setup ─────────────────────────────────────────────────────────────
function initHls(url, onReady) {
  if (hls) { hls.destroy(); hls = null; }

  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(url);
    hls.attachMedia(audioEl);
    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) console.error('HLS fatal error:', data);
    });
  } else if (audioEl.canPlayType('application/vnd.apple.mpegurl')) {
    audioEl.src = url;
    audioEl.addEventListener('loadedmetadata', onReady, { once: true });
  } else {
    audioEl.src = url;
    onReady();
  }
}

// ── Player controls ────────────────────────────────────────────────────────
function playStream(url, meta, isLive = false, seekTo = null) {
  state.player = { ...state.player, ...meta, isLive };
  showPlayerBar(meta);
  updateMediaSession(meta);

  const onReady = () => {
    if (seekTo && seekTo > 0) audioEl.currentTime = seekTo;
    audioEl.play().catch(console.error);
  };

  if (!isLive && url.endsWith('.mp3')) {
    if (hls) { hls.destroy(); hls = null; }
    audioEl.src = url;
    audioEl.addEventListener('loadedmetadata', onReady, { once: true });
  } else {
    initHls(url, onReady);
  }

  if (isLive) startNowPlayingPoll(meta.liveService);
  else stopNowPlayingPoll();
}

function showPlayerBar(meta) {
  playerTrack.textContent = meta.title || 'Loading…';
  playerShow.textContent = meta.show || '';
  playerArtImg.src = meta.image || '';
  playerBar.style.display = 'block';
}

playPauseBtn.addEventListener('click', () => {
  if (audioEl.paused) audioEl.play().catch(console.error);
  else audioEl.pause();
});

skipBackBtn.addEventListener('click', () => {
  if (!state.player.isLive) audioEl.currentTime = Math.max(0, audioEl.currentTime - 30);
});

skipFwdBtn.addEventListener('click', () => {
  if (!state.player.isLive) audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + 30);
});

seekBar.addEventListener('input', () => {
  if (audioEl.duration && !state.player.isLive) {
    audioEl.currentTime = (seekBar.value / 100) * audioEl.duration;
  }
});

// ── Audio event listeners ──────────────────────────────────────────────────
audioEl.addEventListener('play', () => {
  state.player.isPlaying = true;
  playPauseBtn.querySelector('.icon-play').style.display = 'none';
  playPauseBtn.querySelector('.icon-pause').style.display = 'block';
  updateEpPlayBtn();
});

audioEl.addEventListener('pause', () => {
  state.player.isPlaying = false;
  playPauseBtn.querySelector('.icon-play').style.display = 'block';
  playPauseBtn.querySelector('.icon-pause').style.display = 'none';
  updateEpPlayBtn();
});

audioEl.addEventListener('timeupdate', () => {
  const { currentTime, duration } = audioEl;
  if (duration && !state.player.isLive) {
    const pct = (currentTime / duration) * 100;
    progressFill.style.width = pct + '%';
    seekBar.value = pct;
    playerTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    highlightActiveTrack(currentTime);
    // Save progress every 5s (throttled)
    if (!progressSaveTimer) {
      progressSaveTimer = setTimeout(() => {
        saveProgress(state.player.currentEpisodeId, audioEl.currentTime);
        progressSaveTimer = null;
      }, 5000);
    }
  } else if (state.player.isLive) {
    progressFill.style.width = '100%';
    playerTime.textContent = 'LIVE';
  }
});

audioEl.addEventListener('ended', () => {
  clearProgress(state.player.currentEpisodeId);
  updateEpPlayBtn();
  progressFill.style.width = '0%';
});

// Update the play/pause button on the episode detail page
function updateEpPlayBtn() {
  const btn = document.querySelector('.ep-play-btn');
  if (!btn) return;
  const epId = btn.dataset.episodeId;
  const isThis = epId === state.player.currentEpisodeId;
  if (isThis && state.player.isPlaying) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> Pause`;
    btn.classList.add('playing');
  } else {
    const saved = isThis ? null : getSavedProgress(epId);
    const label = isThis ? 'Resume' : saved ? `Resume · ${formatTime(saved)}` : 'Play Mix';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> ${label}`;
    btn.classList.remove('playing');
  }
}

// Highlight the currently playing track in tracklist based on audio position
function highlightActiveTrack(currentTime) {
  const rows = document.querySelectorAll('.track-row[data-offset]');
  if (!rows.length) return;
  let activeRow = null;
  rows.forEach(row => {
    const offset = parseInt(row.dataset.offset, 10);
    if (!isNaN(offset) && currentTime >= offset) activeRow = row;
  });
  rows.forEach(r => r.classList.toggle('active-track', r === activeRow));
}

// ── MediaSession API ───────────────────────────────────────────────────────
function updateMediaSession(meta) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title || 'Astral Rhythm',
    artist: meta.artist || meta.show || 'BBC Radio 1',
    album: 'Astral Rhythm',
    artwork: meta.image ? [{ src: meta.image, sizes: '512x512', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play', () => audioEl.play());
  navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
  navigator.mediaSession.setActionHandler('seekbackward', () => skipBackBtn.click());
  navigator.mediaSession.setActionHandler('seekforward', () => skipFwdBtn.click());
}

// ── Now-playing poll ───────────────────────────────────────────────────────
function startNowPlayingPoll(service = 'bbc_radio_one') {
  stopNowPlayingPoll();
  fetchNowPlaying(service);
  nowPlayingTimer = setInterval(() => fetchNowPlaying(service), 30000);
}

function stopNowPlayingPoll() {
  clearInterval(nowPlayingTimer);
  nowPlayingTimer = null;
}

async function fetchNowPlaying(service) {
  try {
    const res = await fetch(`/api/metadata/nowplaying/${service}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    const displayTitle = data.show.displayTitle || data.show.title;
    playerTrack.textContent = displayTitle || state.player.title;
    playerShow.textContent = data.show.subtitle || '';
    if (data.show.image) playerArtImg.src = data.show.image;
    updateMediaSession({ title: displayTitle, show: data.show.subtitle, image: data.show.image || state.player.image });
  } catch (_) {}
}

// ── Navigation ─────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(name + 'View').classList.add('active');
}

function navigateTo(view, opts = {}) {
  state.view = view;
  if (view === 'shows') {
    showView('shows');
    backBtn.style.display = "none";
    pageTitle.innerHTML = '<span class="title-icon">📡</span> Astral Rhythm<span style="font-size:0.65rem;color:var(--text-muted);font-weight:400;margin-left:8px">BBC Pirate Radio</span>';
    state.currentShow = null;
    state.currentEpisode = null;
    stopNowPlayingPoll();
  } else if (view === 'episodes') {
    const { show } = opts;
    state.currentShow = show;
    showView('episodes');
    backBtn.style.display = "flex";
    pageTitle.textContent = show.title;
    renderShowHero(show);
    loadEpisodes(show);
  } else if (view === 'episode') {
    const { show, episodeId } = opts;
    showView('episode');
    backBtn.style.display = "flex";
    pageTitle.textContent = show.title;
    loadEpisodeDetail(show, episodeId);
  }
}

function navigateBack() {
  if (state.view === 'episode') {
    // Back to episodes list — no re-fetch
    state.view = 'episodes';
    showView('episodes');
    backBtn.style.display = "flex";
    pageTitle.textContent = state.currentShow.title;
  } else if (state.view === 'episodes') {
    navigateTo('shows');
  }
  // Already on shows — do nothing
}

backBtn.addEventListener('click', navigateBack);

// ── Shows ──────────────────────────────────────────────────────────────────
async function loadShows() {
  try {
    const res = await fetch('/api/shows');
    const data = await res.json();
    state.shows = data.shows;
    renderShows(data.shows);
  } catch (err) {
    $('showsGrid').innerHTML = `<div class="empty-state">⚠️ Could not load shows<p>${err.message}</p></div>`;
  }
}

function renderShows(shows) {
  const grid = $('showsGrid');
  grid.innerHTML = shows.map(show => `
    <div class="show-card" data-show-id="${show.id}" role="button" tabindex="0">
      <div class="show-card-art">
        <img src="${show.image}" alt="${show.title}" loading="lazy" onerror="this.style.display='none'">
        ${show.liveOnly ? '<span class="live-badge">Live</span>' : ''}
      </div>
      <div class="show-card-body">
        <div class="show-card-title">${show.title}</div>
        <div class="show-card-host">${show.host}</div>
        <div class="show-card-schedule">${show.scheduleDay} ${show.scheduleTime}</div>
        <button class="show-card-play" style="background:${show.colour}" data-show-id="${show.id}" data-live="${show.liveOnly || false}">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          ${show.liveOnly ? 'Listen Live' : 'Episodes'}
        </button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.show-card').forEach(card => {
    card.addEventListener('click', e => {
      const btn = e.target.closest('.show-card-play');
      const show = state.shows.find(s => s.id === card.dataset.showId);
      if (!show) return;
      if (btn && btn.dataset.live === 'true') {
        playLive(show);
      } else {
        navigateTo('episodes', { show });
      }
    });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
  });
}

// ── Live stream ────────────────────────────────────────────────────────────
function playLive(show) {
  state.player.currentEpisodeId = null;
  playStream(`/api/stream/live/${show.liveService}`, {
    title: show.title,
    show: 'BBC Radio 1',
    image: show.image,
    liveService: show.liveService,
  }, true);
}

// ── Episodes list ──────────────────────────────────────────────────────────
function renderShowHero(show) {
  $('showHero').innerHTML = `
    <img class="show-hero-art" src="${show.image}" alt="${show.title}" onerror="this.style.display='none'">
    <div class="show-hero-info">
      <div class="show-hero-title">${show.title}</div>
      <div class="show-hero-host">${show.host}</div>
      <div class="show-hero-desc">${show.description}</div>
      ${!show.liveOnly ? `
        <button class="hero-live-btn" style="background:${show.colour}">
          <span class="live-dot"></span> Listen Live
        </button>` : ''}
    </div>
  `;
  $('showHero').querySelector('.hero-live-btn')?.addEventListener('click', () => playLive(show));
}

async function loadEpisodes(show) {
  const listEl = $('episodesList');
  listEl.innerHTML = '<div class="skeleton-card" style="height:80px;border-radius:12px;margin-bottom:12px"></div>'.repeat(4);
  try {
    const res = await fetch(`/api/shows/${show.id}/episodes`);
    const data = await res.json();
    if (!data.episodes || !data.episodes.length) {
      listEl.innerHTML = `<div class="empty-state">No episodes available<p>Try listening live above.</p></div>`;
      return;
    }
    // Cache episodes on the show object for the detail page
    state.currentShow._episodes = data.episodes;
    renderEpisodes(data.episodes, show);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">⚠️ Could not load episodes<p>${err.message}</p></div>`;
  }
}

function renderEpisodes(episodes, show) {
  $('episodesList').innerHTML = episodes.map(ep => `
    <div class="episode-card" data-episode-id="${ep.id}" role="button" tabindex="0">
      <img class="episode-art" src="${ep.image || show.image}" alt="" loading="lazy" onerror="this.src='${show.image}'">
      <div class="episode-info">
        <div class="episode-title">${ep.title}</div>
        <div class="episode-meta">
          ${ep.date ? `<span>${formatDate(ep.date)}</span>` : ''}
          ${ep.duration ? `<span>${formatTime(ep.duration)}</span>` : ''}
        </div>
        <div class="episode-desc">${ep.description || ''}</div>
        <div class="episode-card-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>
  `).join('');

  $('episodesList').querySelectorAll('.episode-card').forEach(card => {
    const handler = () => {
      navigateTo('episode', { show, episodeId: card.dataset.episodeId });
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

// ── Episode detail ─────────────────────────────────────────────────────────
async function loadEpisodeDetail(show, episodeId) {
  const container = $('episodeDetail');
  container.innerHTML = `
    <div class="skeleton-card" style="aspect-ratio:16/9;border-radius:16px;margin-bottom:16px"></div>
    <div class="skeleton-card" style="height:24px;border-radius:6px;margin-bottom:8px"></div>
    <div class="skeleton-card" style="height:16px;border-radius:6px;width:60%;margin-bottom:20px"></div>
    <div class="skeleton-card" style="height:48px;border-radius:12px"></div>
  `;

  try {
    const res = await fetch(`/api/shows/${show.id}/episodes/${episodeId}`);
    if (!res.ok) throw new Error('Could not load episode');
    const data = await res.json();
    state.currentEpisode = data.episode;
    renderEpisodeDetail(data.show, data.episode);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">⚠️ ${err.message}</div>`;
  }
}

function renderEpisodeDetail(show, ep) {
  const isPlaying = state.player.currentEpisodeId === ep.id && state.player.isPlaying;
  const savedTime = getSavedProgress(ep.id);
  const isLoaded = state.player.currentEpisodeId === ep.id;
  const playLabel = isPlaying ? 'Pause' : (isLoaded || savedTime) ? `Resume${savedTime && !isLoaded ? ' · ' + formatTime(savedTime) : ''}` : 'Play Mix';
  const playIcon = isPlaying
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

  const tracklistHtml = ep.tracklist && ep.tracklist.length
    ? ep.tracklist.map(t => `
        <div class="track-row" data-offset="${t.offset ?? ''}">
          <span class="track-num">${t.position}</span>
          <div class="track-info">
            <div class="track-title">${escHtml(t.title || 'ID')}</div>
            <div class="track-artist">${escHtml(t.artist)}</div>
          </div>
          ${t.offset != null ? `<span class="track-time">${formatTime(t.offset)}</span>` : ''}
          ${t.label ? `<span class="track-label">${escHtml(t.label)}</span>` : ''}
        </div>`).join('')
    : `<p class="no-tracklist">Tracklist not available for this episode.</p>`;

  $('episodeDetail').innerHTML = `
    <div class="ep-hero">
      <img class="ep-hero-art" src="${ep.image || show.image}" alt="${escHtml(ep.title)}" onerror="this.src='${show.image}'">
      <div>
        <div class="ep-hero-title">${escHtml(ep.title)}</div>
        <div class="ep-hero-meta">
          ${ep.date ? `<span>${formatDate(ep.date)}</span>` : ''}
          ${ep.duration ? `<span>${formatTime(ep.duration)}</span>` : ''}
          <span>${escHtml(show.title)}</span>
        </div>
        ${ep.description ? `<div class="ep-hero-desc">${escHtml(ep.description)}</div>` : ''}
        <button class="ep-play-btn${isPlaying ? ' playing' : ''}" data-episode-id="${ep.id}" style="background:${show.colour};margin-top:16px">
          ${playIcon} ${playLabel}
        </button>
        ${(isLoaded || savedTime) ? `<button class="ep-restart-btn" data-episode-id="${ep.id}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
          Restart
        </button>` : ''}
      </div>
    </div>
    <div class="tracklist-section">
      <div class="tracklist-heading">Tracklist · ${ep.tracklist ? ep.tracklist.length : 0} tracks</div>
      ${tracklistHtml}
    </div>
  `;

  $('episodeDetail').querySelector('.ep-play-btn').addEventListener('click', () => handleEpPlay(show, ep));

  $('episodeDetail').querySelector('.ep-restart-btn')?.addEventListener('click', () => {
    clearProgress(ep.id);
    if (state.player.currentEpisodeId === ep.id) {
      audioEl.currentTime = 0;
      audioEl.play().catch(console.error);
    } else {
      handleEpPlay(show, ep);
    }
    renderEpisodeDetail(show, ep);
  });

  // Clicking a track row seeks to that point if this episode is loaded
  $('episodeDetail').querySelectorAll('.track-row[data-offset]').forEach(row => {
    row.addEventListener('click', () => {
      const offset = parseInt(row.dataset.offset, 10);
      if (isNaN(offset)) return;
      if (state.player.currentEpisodeId === ep.id && audioEl.duration) {
        audioEl.currentTime = offset;
        audioEl.play().catch(console.error);
      }
    });
  });
}

async function handleEpPlay(show, ep) {
  const btn = document.querySelector('.ep-play-btn');

  // Toggle if already loaded
  if (state.player.currentEpisodeId === ep.id) {
    if (audioEl.paused) audioEl.play().catch(console.error);
    else audioEl.pause();
    return;
  }

  state.player.currentEpisodeId = ep.id;
  if (btn) { btn.disabled = true; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Loading…`; }

  try {
    const res = await fetch(`/api/stream/episode/${ep.id}`);
    if (!res.ok) throw new Error('Stream unavailable');
    const { streamUrl } = await res.json();
    if (!streamUrl) throw new Error('No stream URL');

    const savedTime = getSavedProgress(ep.id);
    playStream(streamUrl, { title: ep.title, show: show.title, image: ep.image || show.image }, false, savedTime);
  } catch (err) {
    state.player.currentEpisodeId = null;
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play Mix`; }
    alert('Could not load stream: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Episode progress persistence ──────────────────────────────────────────
const PROGRESS_KEY = 'ar_progress';
const PROGRESS_MIN_SECS = 30; // don't save if barely started
let progressSaveTimer = null;

function saveProgress(episodeId, currentTime) {
  if (!episodeId || !currentTime || currentTime < PROGRESS_MIN_SECS) return;
  try {
    const all = getProgressStore();
    all[episodeId] = { t: Math.floor(currentTime), ts: Date.now() };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch (_) {}
}

function clearProgress(episodeId) {
  try {
    const all = getProgressStore();
    delete all[episodeId];
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch (_) {}
}

function getSavedProgress(episodeId) {
  try {
    const all = getProgressStore();
    return all[episodeId] ? all[episodeId].t : null;
  } catch (_) { return null; }
}

function getProgressStore() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (_) { return {}; }
}

// ── Utilities ──────────────────────────────────────────────────────────────
function formatTime(secs) {
  if (secs == null || secs === '') return '';
  const s = Number(secs);
  if (isNaN(s)) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
state.view = 'shows';
loadShows();

# Astral Rhythm

Personal BBC Radio 1 dance show streaming app. Streams Essential Mix, Pete Tong, Danny Howard, and Radio 1 Dance from a US-based server — no UK proxy required.

---

## Stack

- **Backend:** Node.js + Express, `node-fetch`, `node-cache`
- **Frontend:** Vanilla JS, HLS.js (CDN), PWA (manifest + service worker)
- **Audio:** HLS.js adaptive streaming, MediaSession API for lock screen / CarPlay
- **Deploy:** PM2 + Nginx on DreamHost VPS

---

## Geo-restriction: Not a problem

BBC geo-restriction applies only to the **web player UI**, not the underlying APIs or CDN. All audio is served from worldwide Akamai paths (`ww` variant). The MediaSelector API returns `aod-hls-ww.akamaized.net` URLs even from US IPs. No UK proxy, no VPS in the UK — everything works directly.

If that ever changes, `server/lib/proxy.js` is the hook point for adding proxy support.

---

## Setup

```bash
cp .env.example .env
npm install
npm run dev       # development (auto-restart)
npm start         # production
```

The app runs on `http://localhost:3000` by default.

### `.env` variables

| Variable    | Default | Description                      |
|-------------|---------|----------------------------------|
| `PORT`      | `3000`  | HTTP port                        |
| `APP_URL`   | —       | Public URL (used in manifest)    |
| `CACHE_TTL` | `900`   | API cache TTL in seconds         |

---

## Project structure

```
server/
  index.js            Express entry point, mounts routes, serves public/
  lib/
    bbc.js            All BBC API calls, show catalogue, cache logic
    proxy.js          directFetch() wrapper (no proxy currently needed)
  routes/
    shows.js          /api/shows, /api/shows/:id/episodes, …/:episodeId
    stream.js         /api/stream/live/:service, /api/stream/episode/:id
    metadata.js       /api/metadata/nowplaying/:service
public/
  index.html          SPA shell — three views: showsView, episodesView, episodeView
  app.js              All frontend logic, navigation state, player controls
  style.css           Dark theme, CSS variables, responsive grid
  sw.js               Network-first service worker (no caching of JS/CSS)
  manifest.json       PWA manifest
  icons/              icon-192.png, icon-512.png
```

---

## BBC API endpoints (all work from US, no auth)

### Episodes list
```
GET https://rms.api.bbc.co.uk/v2/programmes/playable
  ?container={showPid}
  &sort=-available_from_date
  &type=episode
  &page_size=8
```

### On-demand stream URL (MediaSelector)
```
GET https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/format/json/mediaset/mobile-phone-main/vpid/{episodePid}
```
- Use the **episode PID** directly (e.g. `m002wvxc`), not a version URN
- Returns `aod-hls-ww.akamaized.net` HLS URL — stream it directly with HLS.js
- Tokens expire ~1 hour; server caches for 3500s

### Tracklist
```
GET https://www.bbc.co.uk/programmes/{episodePid}/segments.json
```
- Returns `segment_events[]` with `segment.type === 'music'`
- Each event has `position`, `segment.artist`, `segment.track_title`, `segment.record_label`, `version_offset` (seconds into the mix)

### Now playing (live)
```
GET https://rms.api.bbc.co.uk/v2/broadcasts/latest?service={service}&on_air=now
```
- Cache for 30s max
- `service` values: `bbc_radio_one`, `bbc_radio_one_dance`

### Live HLS streams (worldwide Akamai, no token needed)
```
bbc_radio_one:       https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio=96000.norewind.m3u8
bbc_radio_one_dance: https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one_dance/bbc_radio_one_dance.isml/bbc_radio_one_dance-audio=96000.norewind.m3u8
```

---

## Show PIDs (verified June 2026)

| Show                       | PID                   | Type       |
|----------------------------|-----------------------|------------|
| Radio 1's Essential Mix    | `b006wkfp`            | Episodes   |
| Pete Tong                  | `b006ww0v`            | Episodes   |
| Radio 1's Dance Party      | `b09c19f4`            | Episodes   |
| Radio 1 Dance              | `bbc_radio_one_dance` | Live only  |

To find a show PID: search BBC Sounds and look at the URL — `/sounds/series/{pid}`.

---

## Server routes

| Method | Path                                        | Returns                                    |
|--------|---------------------------------------------|--------------------------------------------|
| GET    | `/api/shows`                                | `{ shows: [...] }`                         |
| GET    | `/api/shows/:showId/episodes`               | `{ show, episodes: [...] }`                |
| GET    | `/api/shows/:showId/episodes/:episodeId`    | `{ show, episode: {..., tracklist} }`      |
| GET    | `/api/stream/live/:service`                 | 302 redirect to Akamai HLS URL             |
| GET    | `/api/stream/episode/:episodeId`            | `{ streamUrl }`                            |
| GET    | `/api/metadata/nowplaying/:service`         | `{ show, track, next }`                    |

---

## Frontend navigation

Three views, one active at a time: `showsView → episodesView → episodeView`.

State is tracked as a single `state.view` string (`'shows' | 'episodes' | 'episode'`). Back button visibility is set explicitly with `element.style.display = 'none'/'flex'` — **do not use `element.hidden`**, the CSS reset causes `[hidden]` attribute to be unreliable.

```
Home (no back btn)  →  Episodes list (back btn)  →  Episode detail (back btn)
navigateTo('shows')     navigateTo('episodes')        navigateTo('episode')
                        navigateBack() → shows         navigateBack() → episodes
```

Play buttons only appear on the **episode detail page**, not on episode list cards (list cards navigate to detail on click).

---

## Audio player

- Persistent bottom bar, shown/hidden with `playerBar.style.display`
- HLS.js handles adaptive streaming; falls back to native `<audio>` if HLS.js unavailable
- Skip ±30s buttons (disabled for live)
- Progress bar doubles as seek scrubber (disabled for live)
- Time display: `current / total` (live shows `LIVE`)
- Tracklist rows have `data-offset` attribute; clicking seeks to that position in the mix
- `highlightActiveTrack(currentTime)` adds `.active-track` class to current row during playback
- MediaSession API wires up lock screen / CarPlay controls

---

## PWA / iPhone

- Add to Home Screen installs as standalone app
- `manifest.json` sets `display: standalone`, theme `#0a0a0a`
- `apple-mobile-web-app-capable` meta tag enables full-screen on iOS
- Service worker is **network-first** — JS/CSS always fetched fresh; only shell HTML falls back to cache if offline

---

## Known gotchas

- **`[hidden]` attribute unreliable**: The CSS reset (`* { margin: 0; padding: 0 }`) interacts with `[hidden]`. Always use `element.style.display` in JS, and `style="display:none"` in HTML instead of the `hidden` attribute. This affects SVG icons inside buttons too — see play/pause icons in `index.html`.
- **MediaSelector vpid**: Pass the episode PID (e.g. `m002wvxc`), NOT the version PID from a URN (e.g. `m002wvxd`). Using the version PID returns `selectionunavailable`.
- **Stream URL cache TTL**: MediaSelector URLs contain time-limited tokens. Cache for ≤3500s (not the default `CACHE_TTL`).
- **BBC Sounds podcast RSS**: `podcasts.files.bbci.co.uk/{pid}.rss` no longer works. Use the RMS `programmes/playable` API instead.
- **Now-playing endpoint**: `polling.bbc.co.uk/radio/nowandnext/` returns 404. Use `rms.api.bbc.co.uk/v2/broadcasts/latest` instead.
- **Stale service worker**: SW is network-first so development changes are always picked up. If you ever switch to cache-first, bump the `CACHE` version constant in `sw.js` on every deploy.

---

## Deployment (DreamHost VPS)

See `deploy.sh` for automated deploy. Key steps:

1. `npm install --omit=dev`
2. `pm2 start server/index.js --name astral-rhythm`
3. Nginx proxies `localhost:3000`, serves SSL via Let's Encrypt

Nginx config is in `nginx.conf`. Save PM2 process list with `pm2 save`.

---

## App identity

- **App name:** Astral Rhythm
- **Subtitle:** BBC Pirate Radio
- **Title icon:** 📡
- **Internal package name:** `pirate-radio` (repo/folder name, not user-facing)

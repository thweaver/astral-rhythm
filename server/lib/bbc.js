const NodeCache = require('node-cache');
const { directFetch } = require('./proxy');

const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 900 });

// Worldwide BBC Radio 1 HLS live streams — no UK proxy needed
const LIVE_STREAMS = {
  bbc_radio_one: 'https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio=320000.norewind.m3u8',
  bbc_radio_one_dance: 'https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one_dance/bbc_radio_one_dance.isml/bbc_radio_one_dance-audio=320000.norewind.m3u8',
  bbc_radio_one_relax: 'https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one_relax/bbc_radio_one_relax.isml/bbc_radio_one_relax-audio=320000.norewind.m3u8',
};

// BBC Sounds API base — works from US, no auth required
const RMS_BASE = 'https://rms.api.bbc.co.uk/v2';
const MEDIASELECTOR_BASE = 'https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/format/json/mediaset';
const MEDIASETS = ['pc', 'mobile-phone-main'];

// Show catalogue — PIDs verified via BBC Sounds experience/search API
const SHOWS = [
  {
    id: 'b006wkfp',
    title: "Radio 1's Essential Mix",
    host: 'Various Artists',
    description: "The world's biggest DJs on the world's biggest decks. Two hours of continuous music every Saturday night.",
    scheduleDay: 'Saturday',
    scheduleTime: '00:00–02:00 GMT',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one',
    colour: '#e40000',
  },
  {
    id: 'b006ww0v',
    title: 'Pete Tong',
    host: 'Pete Tong',
    description: 'The Essential Selection from Pete Tong. The cream of new dance music and the biggest DJs every Friday.',
    scheduleDay: 'Friday',
    scheduleTime: '23:00–01:00 GMT',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one',
    colour: '#7c4dff',
  },
  {
    id: 'b09c19f4',
    title: "Radio 1's Dance Party",
    host: 'Danny Howard',
    description: 'Dance Party with Danny Howard. The biggest dance anthems every Friday night.',
    scheduleDay: 'Friday',
    scheduleTime: '21:00–23:00 GMT',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one',
    colour: '#00bcd4',
  },
  {
    id: 'b09c12lj',
    title: "Radio 1's Drum & Bass Show",
    host: 'Charlie Tee',
    description: "The best in drum & bass with Charlie Tee every Thursday night on BBC Radio 1.",
    scheduleDay: 'Thursday',
    scheduleTime: '21:00–23:00 GMT',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one',
    colour: '#1a237e',
  },
  {
    id: 'm000zc82',
    title: "Radio 1's Future Dance",
    host: 'Sarah Story',
    description: "The newest sounds in underground dance music with Sarah Story every Saturday night.",
    scheduleDay: 'Saturday',
    scheduleTime: '23:00–01:00 GMT',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one',
    colour: '#00695c',
  },
  {
    id: 'm000h0zx',
    title: 'BBC Introducing on Radio 1 Dance',
    host: 'Jaguar',
    description: "Showcasing the best new and emerging dance music artists with Jaguar.",
    scheduleDay: 'Sunday',
    scheduleTime: '00:00–02:00 GMT',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one_dance',
    colour: '#4a148c',
  },
  {
    id: 'bbc_radio_one_dance_live',
    title: 'Radio 1 Dance',
    host: 'Various',
    description: 'BBC Radio 1 Dance — 24/7 dance music. Electronic, house, techno, drum & bass and more.',
    scheduleDay: 'Daily',
    scheduleTime: '24/7',
    image: 'https://ichef.bbci.co.uk/images/ic/480x270/p0m0slhx.jpg',
    liveService: 'bbc_radio_one_dance',
    colour: '#ff6d00',
    liveOnly: true,
  },
];

const RMS_HEADERS = {
  'Accept': 'application/json',
  'Origin': 'https://www.bbc.co.uk',
  'Referer': 'https://www.bbc.co.uk/sounds',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function getShows() {
  return SHOWS;
}

async function getEpisodes(showId) {
  const cacheKey = `episodes:${showId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const show = SHOWS.find(s => s.id === showId);
  if (!show) throw new Error('Show not found');

  if (show.liveOnly) {
    const result = { show, episodes: [] };
    cache.set(cacheKey, result);
    return result;
  }

  const episodes = await fetchBbcSoundsEpisodes(show);
  const result = { show, episodes };
  cache.set(cacheKey, result);
  return result;
}

async function fetchBbcSoundsEpisodes(show) {
  const PAGE_SIZE = 30; // API maximum
  let offset = 0;
  let allEpisodes = [];

  while (true) {
    const url = `${RMS_BASE}/programmes/playable?container=${show.id}&sort=-available_from_date&type=episode&page_size=${PAGE_SIZE}&offset=${offset}`;
    const res = await directFetch(url, { headers: RMS_HEADERS });
    if (!res.ok) throw new Error(`BBC Sounds API ${res.status}`);
    const data = await res.json();

    const page = data.data || [];
    allEpisodes = allEpisodes.concat(page);

    // Stop when we've received everything the API has
    if (allEpisodes.length >= (data.total || 0) || page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allEpisodes.map(ep => {
    const rawImage = ep.image_url || '';
    const image = rawImage.replace('{recipe}', '480x270') || show.image;
    const title = ep.titles
      ? [ep.titles.primary, ep.titles.secondary].filter(Boolean).join(' — ')
      : ep.id;

    return {
      id: ep.id,
      title,
      date: ep.release ? ep.release.date : null,
      description: ep.synopses ? (ep.synopses.long || ep.synopses.medium || ep.synopses.short || '') : '',
      duration: ep.duration ? ep.duration.value : null,
      image,
      tracklist: [],
      source: 'bbc-sounds',
    };
  });
}

// Get worldwide HLS stream URL for an on-demand episode via MediaSelector.
// Tries mediasets in order (highest quality first) and falls back on failure.
async function getEpisodeStreamUrl(episodeId) {
  const cacheKey = `stream:${episodeId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  };

  for (const mediaset of MEDIASETS) {
    try {
      const url = `${MEDIASELECTOR_BASE}/${mediaset}/vpid/${episodeId}`;
      const res = await directFetch(url, { headers });
      if (!res.ok) { console.warn(`MediaSelector ${mediaset} → HTTP ${res.status}`); continue; }

      const data = await res.json();
      if (data.result) { console.warn(`MediaSelector ${mediaset} → ${data.result}`); continue; }

      const media = (data.media || []).find(m => m.kind === 'audio');
      if (!media) { console.warn(`MediaSelector ${mediaset} → no audio media`); continue; }

      const conn = (media.connection || []).find(c => c.transferFormat === 'hls' && c.protocol === 'https')
        || (media.connection || []).find(c => c.transferFormat === 'hls');
      if (!conn) { console.warn(`MediaSelector ${mediaset} → no HLS connection`); continue; }

      console.log(`Stream resolved via mediaset: ${mediaset}`);
      cache.set(cacheKey, conn.href, 3500);
      return conn.href;
    } catch (err) {
      console.warn(`MediaSelector ${mediaset} failed:`, err.message);
    }
  }

  throw new Error('No stream available from any mediaset');
}

// Now-playing metadata for a live service — uses RMS broadcasts API (no auth, no geo-block)
async function getNowPlaying(service = 'bbc_radio_one') {
  const cacheKey = `nowplaying:${service}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `${RMS_BASE}/broadcasts/latest?service=${service}&on_air=now`;
  try {
    const res = await directFetch(url, { headers: RMS_HEADERS });
    if (!res.ok) throw new Error(`Broadcasts API ${res.status}`);
    const data = await res.json();
    const result = parseNowPlaying(data);
    cache.set(cacheKey, result, 30);
    return result;
  } catch (err) {
    console.error('Now-playing failed:', err.message);
    return null;
  }
}

function parseNowPlaying(data) {
  const broadcast = data.data && data.data[0];
  if (!broadcast) return null;
  const prog = broadcast.programme || {};
  const titles = prog.titles || {};
  const image = prog.images && prog.images[0] ? prog.images[0].url.replace('{recipe}', '480x270') : null;

  // Full display title: "Martha — PAURRO in the guest mix..."
  const showTitle = titles.display_title || titles.primary || '';

  return {
    show: {
      title: titles.primary || '',
      subtitle: titles.secondary || titles.entity_title || '',
      startTime: broadcast.start || null,
      endTime: broadcast.end || null,
      image,
      displayTitle: showTitle,
    },
    track: {
      artist: null,
      title: null,
    },
    next: {
      title: '',
      startTime: null,
    },
  };
}

function getLiveStreamUrl(service) {
  return LIVE_STREAMS[service] || LIVE_STREAMS.bbc_radio_one;
}

async function getEpisodeDetail(showId, episodeId) {
  const cacheKey = `episode-detail:${episodeId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const show = SHOWS.find(s => s.id === showId);
  if (!show) throw new Error('Show not found');

  // Get episode from the episodes list (already cached after show page load)
  const { episodes } = await getEpisodes(showId);
  const ep = episodes.find(e => e.id === episodeId);
  if (!ep) throw new Error('Episode not found');

  // Fetch tracklist from BBC programmes segments API
  let tracklist = [];
  try {
    const res = await directFetch(`https://www.bbc.co.uk/programmes/${episodeId}/segments.json`);
    if (res.ok) {
      const data = await res.json();
      tracklist = (data.segment_events || [])
        .filter(ev => ev.segment && ev.segment.type === 'music')
        .map(ev => ({
          position: ev.position,
          artist: ev.segment.artist || (ev.segment.primary_contributor && ev.segment.primary_contributor.name) || '',
          title: ev.segment.track_title || ev.segment.title || '',
          label: ev.segment.record_label || null,
          offset: ev.version_offset || null, // seconds into the mix
        }));
    }
  } catch (err) {
    console.error('Tracklist fetch failed:', err.message);
  }

  const result = { show, episode: { ...ep, tracklist } };
  cache.set(cacheKey, result, 3600);
  return result;
}

module.exports = { getShows, getEpisodes, getEpisodeDetail, getEpisodeStreamUrl, getNowPlaying, getLiveStreamUrl };

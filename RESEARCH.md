# Geo-Restriction Research: BBC Radio 1 from US

## Summary of Findings

### ⭐ Critical Discovery: NO UK PROXY NEEDED AT ALL

After full testing from a US IP, every BBC Radio 1 component works without any proxy:

| Endpoint | Status from US |
|----------|---------------|
| Live HLS stream (Akamai `ww`) | ✅ Works, no proxy |
| On-demand HLS stream (Akamai `aod-hls-ww`) | ✅ Works, no proxy |
| BBC Sounds episode API (`rms.api.bbc.co.uk/v2`) | ✅ Works, no auth needed |
| MediaSelector API (`open.live.bbc.co.uk/mediaselector`) | ✅ Works, returns worldwide URLs |
| Now-playing broadcasts API | ✅ Works |

The BBC geo-restriction applies to the **web player UI** (iPlayer / BBC Sounds website) and **login-required features** — but the underlying audio delivery CDN and metadata APIs are worldwide-open. A UK proxy is not required for this app.

---

### Critical Discovery: Live Stream Is NOT Geo-Restricted

BBC Radio 1's live stream is available worldwide via Akamai CDN with no geo-gating:

```
https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio=96000.norewind.m3u8
```

The `ww` (worldwide) path variant exists for most BBC national radio stations and is accessible from any IP address. UK-only streams use `uk` in that path. The live stream does NOT require a UK proxy.

**BBC Radio 1 sub-channels (also worldwide):**
- Radio 1 Dance: `https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one_dance/bbc_radio_one_dance.isml/bbc_radio_one_dance-audio=96000.norewind.m3u8`
- Radio 1 Relax: `https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one_relax/bbc_radio_one_relax.isml/bbc_radio_one_relax-audio=96000.norewind.m3u8`

Source: garfnet.org.uk (January 2025 update), GitHub gists confirming worldwide access

### On-Demand Episodes: ARE Geo-Restricted

BBC Sounds on-demand episode playback requires a UK IP address. The flow:
1. BBC Sounds API (`rms.api.bbc.co.uk/v2`) returns episode metadata + version PIDs
2. BBC MediaSelector API (`open.live.bbc.co.uk/mediaselector/6/...`) takes a version PID and returns stream manifest URLs — **this call is geo-gated**
3. The returned HLS manifests (Akamai/Fastly delivery) are also IP-checked

The BBC RMS metadata API itself appears to return results without geo-gating (metadata is publicly indexed), but MediaSelector checks the client IP.

### Now-Playing Metadata: NOT Geo-Restricted

The live track polling endpoint is publicly accessible:
```
https://polling.bbc.co.uk/radio/nowandnext/bbc_radio_one
```
Returns JSON with current programme, next programme, and often now-playing track title/artist.

---

## Approach Evaluation

### Option 1: Worldwide HLS Live Stream (No Proxy)
**For:** Live Radio 1 stream only  
**Verdict: ✅ WORKS — use this**  
- Zero infrastructure cost
- Highest reliability (BBC's own CDN)
- 96 kbps AAC worldwide, 320 kbps in UK  
- Stream URL has been stable since Jan 2025 (previous format worked Oct 2023–Jan 2025)

### Option 2: UK VPS Stream Relay (for On-Demand)
**Verdict: ✅ RECOMMENDED for on-demand**  
- ~$4–6/month: OVH UK VPS (confirmed working by community), Hetzner Helsinki/UK  
- The DreamHost VPS creates an SSH SOCKS5 tunnel to the UK VPS
- Node.js uses `socks-proxy-agent` to route MediaSelector API calls and HLS segment fetches through that tunnel
- OVH UK has been specifically confirmed to work with iPlayer/Sounds on LowEndTalk (2024–2025 threads)
- Caveat: datacenter IPs are "cat and mouse" — IP blocks happen but OVH UK ranges have good history
- Fallback: rotate to a new IP on the same VPS provider if blocked

### Option 3: Commercial Proxy API (Bright Data, etc.)
**Verdict: ❌ Overkill for personal use**  
- $15–50+/month for residential IPs
- Residential IPs most reliable but unnecessary cost for personal app

### Option 4: Third-Party Stream Aggregators (radio-browser.info, etc.)
**Verdict: ⚠️ Live stream only, limited**  
- radio-browser.info lists BBC Radio 1 community-reported streams
- Redundant given we have the direct Akamai URL
- No on-demand episode support

### Option 5: RadioDNS / BBC RSS
**Verdict: ⚠️ Metadata only**  
- BBC publishes podcast RSS for some shows (Essential Mix has a podcast feed)
- Podcast feed gives free access to recent episodes WITHOUT geo-blocking (it's a podcast!)
- `https://podcasts.files.bbci.co.uk/b006wks4.rss` — Essential Mix podcast RSS
- This is a significant bonus: podcast episodes are accessible from any IP
- Not all episodes are in the podcast feed (only recent ones, usually 4–8 weeks)

---

## Recommended Architecture

### Tier 1: Podcast RSS (Zero infrastructure, free on-demand)
Some BBC Radio 1 dance shows publish podcast feeds accessible worldwide:
- Essential Mix: `https://podcasts.files.bbci.co.uk/b006wks4.rss`
- Pete Tong: `https://podcasts.files.bbci.co.uk/b006tp52.rss`
- Danny Howard: `https://podcasts.files.bbci.co.uk/b01x9zzb.rss`

Parse the RSS server-side, cache 15 min, return episode metadata + direct MP3 stream URLs. **These stream URLs work from any IP — they are served via Akamai without geo-check because they are podcast feeds.**

### Tier 2: Worldwide Live HLS (Zero infrastructure, free live)
Use the `ww` Akamai HLS URL for live Radio 1 and Radio 1 Dance.

### Tier 3: UK VPS Relay (For full BBC Sounds on-demand access)
Optional — needed only if you want episodes beyond what's in the podcast feed.  
Setup:
1. Spin up OVH UK VPS (€3.50/month starter), install 3proxy or use SSH SOCKS5
2. On DreamHost VPS: configure `UK_PROXY_URL=socks5://127.0.0.1:1080`
3. Maintain SSH tunnel with autossh: `autossh -M 0 -N -D 1080 user@uk-vps-ip`
4. The Node app routes MediaSelector + HLS segment fetches through this tunnel

---

## Implementation Plan

**Phase 1 (no UK VPS needed):**
- Parse BBC podcast RSS feeds for episode data + stream URLs
- Use worldwide Akamai HLS for live stream
- Poll `polling.bbc.co.uk` for now-playing metadata
- Full UI, PWA, CarPlay support

**Phase 2 (with UK VPS, optional):**
- BBC Sounds API for richer episode metadata + tracklists
- MediaSelector API relay for non-podcast episodes
- HLS segment proxy for on-demand content

The app is built to support both tiers via environment variables — `UK_PROXY_URL` being set enables full BBC Sounds mode; unset falls back to podcast RSS.

---

## BBC Programme PIDs (confirmed)
| Show | PID | Podcast RSS |
|------|-----|------------|
| Essential Mix | b006wks4 | https://podcasts.files.bbci.co.uk/b006wks4.rss |
| Pete Tong | b006tp52 | https://podcasts.files.bbci.co.uk/b006tp52.rss |
| Danny Howard | b01x9zzb | https://podcasts.files.bbci.co.uk/b01x9zzb.rss |
| Radio 1 Dance | bbc_radio_one_dance | (service, not show) |

Verify/update PIDs by checking the BBC Sounds URL: `bbc.co.uk/sounds/brand/{pid}`

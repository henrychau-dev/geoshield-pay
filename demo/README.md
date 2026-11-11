# GeoShield Pay — one-take demo film

**▶ Official demo video: https://youtu.be/GatrPGfM5H0**

The film is a single continuous browser session (no cuts, no title cards, no
transitions) recorded against the real app running locally. Every interception you see
is a real `POST /api/risk/precheck` that really wrote an order to SQLite — the merchant
dashboard in the film shows the very references created seconds earlier. The AI report
is a live DeepSeek call triggered by the on-screen **Re-run** button.

The rendered file (`demo/geoshield-demo-1080p.mp4`) is gitignored and not published in
the repository; the YouTube link above is the canonical copy. Re-record it with
`npm run video` if the UI changes.

| Property | Value |
| --- | --- |
| Resolution / fps | 1920x1080 @ 30 fps, H.264 + AAC |
| Duration | ~114 s |
| Captions | burned in (English), also shipped as `captions.ass` |
| Narration | `en-US-AriaNeural` (edge-tts) |
| Subtitles file | `demo/captions.ass` |

## Shot list

| Time | Scene | What happens on screen |
| --- | --- | --- |
| 0:00 | Landing | Value proposition; cursor scrolls the hero |
| 0:14 | Checkout — honest customer | Real precheck → `PASS`, risk score 0, PayPal buttons render |
| 0:29 | Checkout — VPN fraudster | Tor exit IP (DE) vs New York GPS → `BLOCK` **before any PayPal order exists** |
| 0:47 | Checkout — three-country mismatch | CN/CN/US → `BUFFER`, funds authorized but not captured |
| 1:04 | Risk Command Center | The just-created blocked reference at the top of the live table; buffer-cabin countdown |
| 1:20 | Order detail | Signal chain, timeline, then **Re-run** → fresh `LLM: deepseek-chat` report |
| 1:36 | Rule Center | Blacklist "United States" → **Save & hot-reload** → "Live — reloaded just now" |

## Re-recording

Prerequisites: Chrome installed, `ffmpeg` on PATH, Python 3.11 + `edge-tts`
(`pip install edge-tts`), `.env` with working `AI_API_KEY` (DeepSeek) and PayPal
sandbox credentials, database seeded (`npm run db:push && npm run db:seed`).

```bash
npm run build        # the film records the production server (next start)
npm run video        # seed → preflight → narration → rehearsal → take → compose → restore
```

`npm run video` does, in order:

1. **seed** — 6 baseline orders + default rules (`npm run db:seed`)
2. **preflight** — asserts all three scenario decisions (`PASS`/`BLOCK`/`BUFFER`),
   warms the in-process ip-api cache, and smoke-tests a live DeepSeek analysis
3. **narration** — synthesizes per-scene VO (`demo/.cache/audio/`), measures real
   durations into `demo/.cache/timing.json`
4. **rehearsal** — full run-through without recording; any locator/assertion problem
   surfaces here
5. **take** — one continuous CDP screencast of a real Chrome session; every scene
   asserts its verdict on screen. A failed assertion discards the whole take, re-seeds
   and re-records (`MAX_TAKES`, default 3). Nothing is ever patched or edited in.
6. **compose** — frames → CFR 30 fps, burned ASS captions, narration placed on the
   measured scene boundaries, `loudnorm`, H.264 CRF 18
7. **restore** — stops the server it started and re-seeds the database

Useful overrides:

```bash
PORT=3300 npm run video          # different port (BASE_URL follows PORT)
MAX_TAKES=5 npm run video        # more retries
npm run video -- --skip-tts      # reuse demo/.cache/timing.json
npm run video:record -- --dry    # rehearsal only
```

Intermediate frames/audio live in `demo/.cache/` (gitignored, several hundred MB) and
can be deleted by hand at any time.

## narration script

1. **Landing** — "Every chargeback story ends the same way: the money already left.
   Disputes, evidence, penalties. GeoShield Pay moves the decision earlier — before
   PayPal even creates an order."
2. **Honest customer** — "This is a real checkout. The browser sends device GPS, the
   server resolves the request IP. Both land in the same Californian metro. Verdict:
   pass, risk score zero."
3. **VPN fraudster** — "Same store, same cart. But this IP is a Tor exit node in
   Germany while the phone sits in New York — over six thousand kilometres apart, on a
   proxy network. Hard-blocked before a PayPal order exists. Nothing to dispute,
   because nothing was charged."
4. **Three-country mismatch** — "Not every fraud is that loud. The geography looks
   clean here, but the PayPal account and billing country are China, shipping to the
   United States. So instead of capturing, GeoShield authorizes the payment and parks
   the funds for seventy-two hours."
5. **Dashboard** — "Every interception you just watched is already in the merchant
   console — that blocked order is the one we created seconds ago. Funds in the buffer
   cabin keep their live countdown. Nothing was captured, so no dispute can open."
6. **AI analyst** — "Open the buffered order: IP versus GPS, the distance, the three
   countries, the interception timeline. Then the AI analyst reads the signal chain and
   writes the story in plain English. This is a live model call, right now."
7. **Rules** — "Finally, the rules. The merchant blacklists one country and saves.
   Under a second later the engine already runs the new rule — no restart, no deploy.
   Blocked before the money moves: that is the product."

## Publishing

- **Devpost "Demo video" field:** `https://youtu.be/GatrPGfM5H0` — no file upload, the
  YouTube link is the submission.
- The local `mp4` is intentionally excluded from git (`.gitignore: demo/*.mp4`); the
  repository only carries the pipeline, the caption file and this document.
- Optional subtitles: `demo/captions.ass` → convert to `.srt` if you want them as a
  YouTube track (`ffmpeg -i captions.ass captions.srt`), then upload under
  *Subtitles* in YouTube Studio.
- If the video needs to be re-recorded after UI changes, just run `npm run video` —
  the timeline re-measures itself from the new narration and assertions — then upload
  the new file over the old YouTube video (same URL kept).

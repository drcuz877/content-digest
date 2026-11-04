# Content Digest

A static, no-build site for bite-sized digests with audio. Plain HTML, CSS, and JavaScript. No external dependencies, no CDN, no server code. It works on GitHub Pages (or any static host) because all routing is hash-based.

## Structure

```
index.html            App shell (side menu, audio player, mount point)
css/style.css         Styles (light and dark via prefers-color-scheme)
js/app.js             Router, drop renderer, archive, search, about, audio player
data/drops.json       Full content: a list of drops, newest first (also the search corpus)
data/index.json       Lightweight listing used by the archive (rebuilt by the tool)
data/legend.json      Icon legend shown on the About page
audio/                <drop-id>-podcast.mp3 (new drops); older drops: <drop-id>-william/ryan/alba.mp3
tools/add_drop.py     Validates and adds a drop, then rebuilds the index
.nojekyll             Tells GitHub Pages to serve files as-is
```

Routes: `#/latest`, `#/archive`, `#/drop/<id>`, `#/drop/<id>/<yyyy-mm-dd>`, `#/search?q=<text>`, `#/about`.

## Drop format

One JSON object per drop:

```json
{
  "id": "drop-002",
  "title": "Drop #2: Feb 1 to 14, 2026",
  "start": "2026-02-01",
  "end": "2026-02-14",
  "intro": "One or two sentences about the period.",
  "spotlight": {"icon": "🔢", "value": "85", "label": "Short label", "detail": "Optional detail"},
  "note": "Optional small note shown under the intro.",
  "audio": {
    "podcast": "audio/drop-005-podcast.mp3",
    "podcast_seconds": 1800
  },
  "issues": [
    {
      "id": "2026-02-01",
      "label": "Issue of Feb 1",
      "weekday": "Sun",
      "top": "One-line top story for the At a glance list",
      "sections": [
        {"icon": "💰", "name": "Finance", "bullets": [
          {"h": "Headline (shown in Quick scan)", "t": "One or two sentence summary (shown in Full bites)."}
        ]}
      ]
    }
  ]
}
```

Rules:

- `spotlight`, `note`, `weekday`, `top`, and a bullet's `t` are optional. Every bullet needs `h`.
- Every section needs an `icon` (emoji), a `name`, and at least one bullet.
- Keep summaries short. Do not paste full articles into a public repo.
- No em dashes and no URLs in text.
- `audio` is required. New drops use `podcast` (path to one two-host episode) plus optional `podcast_seconds` (shown as the episode length). Older drops use the three voice keys `william`, `ryan`, `alba`; those are only required when there is no `podcast`.
- Section colors come from the section name (see `data-sec` rules in `css/style.css`). Add a rule there for a new section name, and add the icon to `data/legend.json` so the About page explains it.

## Add a drop

1. Write the drop JSON (for example `/tmp/drop-002.json`).
2. Write a two-host podcast script and generate one mp3 into `audio/`, named `<drop-id>-podcast.mp3`.
   - Hosts: Andrew (`en-US-AndrewMultilingualNeural`) and Ryan (`en-GB-RyanNeural`), rate +15%, pitch +2Hz.
   - About 25 to 35 minutes, mono 64 kbps. Put the length in seconds in `podcast_seconds`.
   - Older drops (1 to 4) keep their three short voice summaries.
3. Run the tool from the site root:

   ```
   python3 tools/add_drop.py /tmp/drop-002.json
   ```

   It validates the file (required fields, dates, emoji on every section, audio files exist, no em dashes, no banned words), appends the drop to `data/drops.json` (sorted newest first), and rebuilds `data/index.json`.
   Use `--replace` to overwrite a drop with the same id, `--rebuild` to only re-validate and rebuild the index, and `--allow-missing-audio` while drafting.
4. Preview locally: `python3 -m http.server 8000`, then open http://localhost:8000/
5. Commit and push. GitHub Pages serves the folder as-is.

## Player notes

- Speeds: 1x, 1.15x, 1.25x, 1.35x, 1.5x, 1.75x, 2x, with pitch preserved.
- Drops with a podcast show a 🎙️ Podcast tag and the episode length instead of the voice picker.
- Switching voice (older drops) keeps the position as a percentage of the track and keeps the chosen speed, because the voices do not have identical timing.
- Voice, speed, and Full bites or Quick scan are remembered in the browser (localStorage).

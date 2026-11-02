# Working on Drum Machine

- Build the smallest interface that supports playing along. Preserve the large touch targets and nearly full-screen workspace; avoid headings, explanatory footers, badges, or repeated instructions.
- Target the user's personal GitHub Pages hosting at https://ryanlmelvin.github.io/drum_machine/ (repository ryanlmelvin/drum_machine). Keep app URLs and PWA scope relative for project paths.
- Keep the app static and self-contained. Original code and icons are MIT; bundled drum samples are CC0 with exact provenance in THIRD_PARTY_NOTICES.md and assets/audio/sources.json.
- Run npm test, npm run build, and npm run check before publishing. The build updates the service worker hash for all shipped asset changes.
- Publish completed app changes by default unless the user says otherwise.
- Never reload or activate an update automatically during playback. Show Update available and wait for Reload. Never delete another app's service worker caches.
- Preserve tap averaging across the last eight taps, big Start/Stop and Tap tempo pads, four requested styles, and direct BPM entry.
- Do not claim phone, speaker, or long-duration playback verification unless performed.

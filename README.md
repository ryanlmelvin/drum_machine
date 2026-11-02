# Drum Machine

[Open Drum Machine](https://ryanlmelvin.github.io/drum_machine/)

A static, installable drum machine for playing guitar alongside an acoustic kit.

- Pop, jazz swing, rock, and blues shuffle.
- Direct tempo entry from 40–240 BPM, ±1 controls, and tap tempo averaging the last eight taps (seven intervals). A 2.5-second pause starts a new average.
- Large Start/Stop and Tap tempo pads, volume, and a four-beat visual pulse.
- Native Web Audio loops keep the rhythm steady without relying on JavaScript timers. Changing tempo preserves sample pitch; tempo and style changes preserve the beat position with a short crossfade.
- Remembers tempo, style, and volume. Requests a screen wake lock while playing when supported.
- Installs to the home screen and works offline after the initial download. Updates show **Update available → Reload**, and only reload when requested. Updating another tab never interrupts playback here.

Keep the app open while practicing. Mobile browsers can suspend audio when the device locks or the app goes into the background. If interrupted, tap Start to resume. There are no accounts, analytics, ads, external scripts, or runtime dependencies.

## Run

Requires Node.js 22+ for checks and Python 3 for the local server.

```sh
npm run dev
```

Open http://127.0.0.1:4187. Space starts/stops when the page background is focused; T taps tempo. Standard keyboard controls work on each button.

```sh
npm test
npm run build
npm run check
```

The build copies the static app into `dist/` and derives the service worker version from every shipped file. Any asset change produces an update. The cache prefix is unique to this app and its path, preserving other GitHub Pages apps on the same origin.

## GitHub Pages

The included `.github/workflows/pages.yml` checks and deploys `dist/` on pushes to `main`. In repository **Settings → Pages**, set the source to **GitHub Actions**. All app URLs and the manifest scope are relative, so both project Pages and custom domains work.

The app needs HTTPS (or localhost) for installation and offline caching. Install via its Install button; iPhone/iPad users can use Safari → Share → Add to Home Screen.

## Sounds and license

Original code, patterns, and icons are MIT licensed. The seven acoustic recordings are from **Virtuosity Drums** by Versilian Studios and Karoryfer Samples, performed by Austin McMahon, released under **CC0**. They may be freely redistributed and modified. This app sequences one-shot samples into original patterns, so tempo changes do not pitch-shift a prerecorded track. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source links, license text, and processing details. Exact asset hashes are verified by the checks.

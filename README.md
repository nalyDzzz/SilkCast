# SilkCast

SilkCast is a desktop IPTV client built with Tauri (Rust backend) and React (TypeScript frontend).

> This project is a client only.  
> No channels, providers, or playlists are bundled.

## Status

SilkCast is in active development.
Core source import, catalog browsing, playback, recents, and settings are implemented.

## Features Available Today

- Import and manage M3U playlist sources (URL or local file)
- Import and manage Xtream sources (server URL, username, password)
- Edit, refresh, and delete sources
- Home dashboard with catalog totals, continue watching, recent and favorite channels
- Browse `Live TV`, `Movies`, and `Series` with a group column, search, and favorites
- Browsing state (filters, open series, scroll position) survives opening the player
- Series episode browsing by season for Xtream sources, with per-episode progress
- Live EPG now/next for Xtream live channels, in the catalog and in the player
- Recents view split by media type
- In-app player for HLS, raw MPEG-TS, MP4, MKV, and WebM streams:
  - channel zapping (buttons, Page Up/Down, or the channel panel) without leaving the player
  - automatic reconnect when a live stream drops, plus a stall watchdog
  - resume position for movies and episodes, up-next countdown between episodes
  - audio track, quality, and speed menus; keyboard shortcuts (press `?` in the player)
  - clear error messages (expired account, connection limits, unsupported formats) with one-click hand-off to MPV
- MPV pop-out playback (keeps the current position and title; honors the hardware decode setting)
- Built-in guide (`Guide` in the sidebar) covering setup, playback, shortcuts, and troubleshooting
- Settings for default player, startup behavior, MPV hardware decode, and theme
- Local persistence with SQLite, plus logs and crash reports

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Zustand
- Desktop runtime: Tauri v2
- Backend: Rust
- Storage: SQLite (`rusqlite` bundled)
- Playback: custom web player (`hls.js`, `mpegts.js`, native `<video>`) fed through a local Rust stream proxy, and `mpv`
- Testing: Vitest + Testing Library (frontend), `cargo test` (backend)

## How In-App Playback Works

IPTV providers rarely send CORS headers, often redirect to load-balancer hosts with
relative segment paths, and sometimes reject browser user agents, so the WebView can't
fetch their streams directly. SilkCast therefore:

1. Starts a token-protected HTTP proxy on `127.0.0.1` at launch (`src-tauri/src/stream_proxy.rs`).
   It adds CORS headers, follows redirects, passes `Range` requests through for seeking,
   rewrites HLS playlists so every segment also goes through the proxy, and sends a
   VLC user agent upstream.
2. Picks an ordered list of engines from the stream URL (`src/lib/player/streamSource.ts`):
   hls.js for `.m3u8`, mpegts.js for `.ts` and extensionless live URLs, the native
   `<video>` element for MP4/MKV/WebM.
3. Runs them through `StreamController` (`src/lib/player/streamController.ts`), which falls
   through to the next engine on format mismatches, times out streams that never start,
   reconnects dropped live streams with backoff, and reports provider HTTP errors as-is.

Formats WebView2 can't decode at all (for example AVI) show an error with an
`Open in MPV` button instead of a black screen.

## Project Layout

- `src/` - React app, pages, UI components, store, and API clients
- `src-tauri/` - Rust backend commands, playback engine, source import/parsing, storage
- `.github/workflows/tests.yml` - CI test job for Windows and Linux
- `.github/workflows/release.yml` - tagged Windows installer release workflow

## Requirements

- Node.js 22+ (CI uses Node 22)
- npm
- Rust toolchain (stable)
- Tauri prerequisites for your OS: [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- MPV requirements:
  - Embedded/`libmpv` backend: dynamic library available on your library path
    - Windows candidates: `mpv-2.dll`, `libmpv-2.dll`, `mpv.dll`
    - Linux candidates: `libmpv.so.2`, `libmpv.so`
  - MPV pop-out: `mpv` executable available on your `PATH` (`mpv` or `mpv.exe`)

### Linux packages used in CI

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

## Getting Started (Development)

```bash
git clone https://github.com/nalyDzzz/SilkCast.git
cd SilkCast
npm install
npm run tauri dev
```

For full desktop behavior, use `npm run tauri dev` instead of only `npm run dev`.

## Scripts

- `npm run dev` - Start Vite dev server
- `npm run tauri dev` - Run the full desktop app in development
- `npm run build` - Build frontend assets
- `npm run tauri build` - Build desktop bundles
- `npm run prepare:mpv-runtime` - Validate/copy Windows MPV runtime DLLs into bundle resources
- `npm run build:windows:exe` - Build NSIS installer (`.exe`)
- `npm run build:windows:installers` - Build NSIS + MSI installers
- `npm run build:windows:installers:strict` - Same as above but fail if required MPV DLLs are missing
- `npm run test` - Run Vitest in watch mode
- `npm run test:run` - Run frontend tests once
- `npm run test:rust` - Run Rust tests
- `npm run test:all` - Run frontend and Rust tests
- `npm run test:coverage` - Run frontend tests with coverage

## Building Windows Installers

1. Place MPV runtime DLLs in a folder (must include one of `mpv-2.dll`, `libmpv-2.dll`, or `mpv.dll`).
2. Set `MPV_DLL_DIR` to that folder.
3. Build installers.

```powershell
$env:MPV_DLL_DIR="C:\path\to\mpv\bin"
npm ci
npm run build:windows:installers
```

Artifacts are produced in:

- `src-tauri/target/release/bundle/nsis/*.exe`
- `src-tauri/target/release/bundle/msi/*.msi`

## Release Tags (GitHub)

Push a tag that starts with `v` (for example `v0.1.0`) to trigger the release workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds Windows installers and uploads them to a draft GitHub Release.

## App Updates

SilkCast uses the Tauri updater to check GitHub Releases for newer versions. The
Settings page includes a manual update check that downloads, installs, and
relaunches the app when a signed update is available.

Updater releases require these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` - contents of the private key generated by
  `tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - password for that private key

The matching public key is committed in `src-tauri/tauri.conf.json`. Keep the
private key backed up outside the repository; installed apps cannot receive
future updates if that key is lost.

The release workflow publishes `latest.json` alongside the installers. The app
checks:

```text
https://github.com/nalyDzzz/SilkCast/releases/latest/download/latest.json
```

To ship an update, bump the version in `package.json`, `src-tauri/Cargo.toml`,
and `src-tauri/tauri.conf.json`, push a `v*` tag, then publish the generated
draft release. The updater compares app versions, not tags, so the release
workflow fails if the tag doesn't match all three files.

## Data and Logs

App data is stored under the OS-specific Tauri app data directory.  
The backend creates:

- `storage/silkcast.db` - SQLite database
- `logs/silkcast.log` - application log
- `crash/` - panic/crash reports

## Platform Notes

- Development and CI currently target Windows and Linux.
- On Wayland compositors (including Hyprland), MPV window embedding is not supported. SilkCast falls back to MPV pop-out mode for that path.

## Legal

SilkCast is a media client only.

- No IPTV providers or playlists are bundled
- No scraping modules are included
- Users are responsible for supplying legally obtained sources

## License

No license file has been added yet.

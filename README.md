# OpenTV (SilkCast)

OpenTV is a desktop IPTV client built with Tauri (Rust backend) and React (TypeScript frontend).  
The app currently uses the product name **SilkCast** in the UI and package metadata.

> This project is a client only.  
> No channels, providers, or playlists are bundled.

## Status

OpenTV is in active development.
Core source import, catalog browsing, playback, recents, and settings are implemented.

## Features Available Today

- Import and manage M3U playlist sources (URL or local file)
- Import and manage Xtream sources (server URL, username, password)
- Edit, refresh, and delete sources
- Browse `Live TV`, `Movies`, and `Series` catalogs
- Filter by group, search by name, and toggle favorites
- Series episode browsing for Xtream sources
- Live EPG now-playing labels and source-level EPG refresh for Xtream live channels
- Recents view split by media type
- In-app web playback (Vidstack) for live and on-demand streams
- MPV pop-out playback
- Settings for hardware decode, startup behavior, default player, and theme
- Local persistence with SQLite, plus logs and crash reports

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Zustand
- Desktop runtime: Tauri v2
- Backend: Rust
- Storage: SQLite (`rusqlite` bundled)
- Playback: Web player (`@vidstack/react`) and `libmpv`/`mpv`
- Testing: Vitest + Testing Library (frontend), `cargo test` (backend)

## Project Layout

- `src/` - React app, pages, UI components, store, and API clients
- `src-tauri/` - Rust backend commands, playback engine, source import/parsing, storage
- `.github/workflows/tests.yml` - CI test job for Windows and Linux

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
git clone https://github.com/nalyDzzz/OpenTV.git
cd OpenTV
npm install
npm run tauri dev
```

For full desktop behavior, use `npm run tauri dev` instead of only `npm run dev`.

## Scripts

- `npm run dev` - Start Vite dev server
- `npm run tauri dev` - Run the full desktop app in development
- `npm run build` - Build frontend assets
- `npm run tauri build` - Build desktop bundles
- `npm run test` - Run Vitest in watch mode
- `npm run test:run` - Run frontend tests once
- `npm run test:rust` - Run Rust tests
- `npm run test:all` - Run frontend and Rust tests
- `npm run test:coverage` - Run frontend tests with coverage

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

OpenTV/SilkCast is a media client only.

- No IPTV providers or playlists are bundled
- No scraping modules are included
- Users are responsible for supplying legally obtained sources

## License

No license file has been added yet.

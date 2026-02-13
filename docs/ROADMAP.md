# OpenTV — Project Roadmap

OpenTV is a modern, open-source IPTV player for Windows.

It focuses on:

- ⚡ fast, GPU-accelerated playback (libmpv)
- 🧭 clean desktop-first UX
- 📺 serious EPG + DVR support
- 🧩 extensibility through plugins
- 🔒 transparency and legality (client only, no content provided)

This document outlines the high-level development phases and release milestones.

---

## Guiding Principles

- **Windows-first.** Cross-platform later.
- **Playback quality > feature count.**
- **Desktop UX first, TV mode later.**
- **No bundled providers or scraping.**
- **Everything reversible, inspectable, and documented.**
- **Source-agnostic design** (M3U, Xtream, others later).

---

# Phase 0 — Foundations

> Goal: stable playback core + architecture that won’t need rewriting.

- Tauri + React desktop shell
- Embedded libmpv rendering into native window
- SQLite persistence layer
- Unified source abstraction:
    - M3U
    - Xtream (planned)
- Event bus between backend and UI
- Logging + debug mode
- Crash diagnostics

---

# Phase 1 — v0.1 “M3U MVP”

> Goal: users can add playlists and comfortably watch TV.

### Features

- Import M3U (URL + local file)
- Parse:
    - channel names
    - groups
    - logos
    - tvg metadata
- Channel browsing + filtering
- Search
- Favorites + recents
- Desktop-first layout:
    - sidebar (sources/groups)
    - channel list
    - player panel
- Embedded playback via libmpv
- Playback controls:
    - play/pause
    - volume
    - fullscreen
- Settings:
    - hardware decode toggle
    - buffering presets
    - startup behavior
- Persist all state across restarts

### Non-Goals

- DVR / recording
- EPG grid
- TV-mode UI
- Plugin system

---

# Phase 2 — v0.2 “Xtream Support”

> Goal: OpenTV becomes usable for most IPTV users.

### Features

- Xtream Codes source type
- Account management
- Category ingestion
- Stream list caching
- Refresh controls
- Header injection (User-Agent, tokens)
- Category → group mapping
- Offline startup using cached data
- Optional EPG ingestion when provided

---

# Phase 3 — v0.3 “EPG”

> Goal: full TV-style browsing experience.

### Features

- XMLTV import
- Automatic refresh schedules
- Channel ↔ EPG mapping UI
- Auto-matching heuristics
- Grid-style program guide
- “Now / Next” overlays
- Program details view

---

# Phase 4 — v0.4 “DVR & Time-Shift”

> Goal: replace paid IPTV clients for advanced users.

### Features

- Pause / rewind live TV
- Ring-buffer time-shift
- Scheduled recordings
- NAS path configuration
- Remux recording mode
- Optional transcoding
- Post-processing hooks
- Recording history UI

---

# Phase 5 — TV Mode & Multi-View

> Goal: couch-friendly experience and sports use cases.

### Features

- 10-foot TV interface
- Gamepad / remote navigation
- Multi-view layouts
- Picture-in-picture
- Sports presets
- UI scaling modes

---

# Phase 6 — Plugins & Extensibility

> Goal: turn OpenTV into a platform.

### Ideas

- Plugin SDK
- WASM sandboxing
- Theme packs
- Subtitle providers
- Automation hooks
- Home-assistant integration
- Metadata enrichers

---

# Long-Term Ideas

These are intentionally not scheduled yet:

- Linux / macOS ports
- Server-mode backend
- Mobile companion app
- Cloud profile sync
- Distributed DVR
- Catch-up TV support
- Torrent / file playback
- Metadata scraping

---

# Contribution Strategy

We welcome contributions in:

- playback tuning
- UI polish
- documentation
- testing
- Xtream providers
- EPG mapping heuristics

Look for issues labeled:

- `good first issue`
- `help wanted`
- `area:ui`
- `area:playback`

---

# Legal / Ethics Note

OpenTV is a **media client only**.

- No channels or providers are distributed.
- No scraping is performed.
- Users must supply their own legally obtained IPTV sources.

---

_Last updated: YYYY-MM-DD_

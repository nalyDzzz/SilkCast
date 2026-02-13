# OpenTV — Architecture

OpenTV is a Windows-first IPTV player with a desktop UI (React) and a native backend (Tauri/Rust) driving playback via **libmpv**.

This document explains the system at a high level: components, boundaries, data flow, and the abstractions that keep M3U and Xtream cleanly integrated.

---

## Goals

- **Fast, stable playback** (GPU decode, low-latency switching)
- **Clean separation of concerns** (UI is “dumb”, backend owns logic)
- **Source-agnostic pipeline** (M3U and Xtream share one model)
- **Scalable UI performance** (virtualized lists, responsive state)
- **Good OSS ergonomics** (contributors can work in one area at a time)

---

## Non-Goals (for now)

- Cross-platform support (Windows first)
- Server mode (single-machine app)
- Plugin sandboxing (planned later)
- EPG grid + DVR in the initial MVP (phased)

---

## High-Level Component Diagram

```
+-------------------+         IPC (Tauri invoke/events)        +------------------------+
|  React UI (TS)    |  <------------------------------------> |  Tauri Backend (Rust)  |
|                   |                                          |                        |
| - Navigation      |                                          | - Source Manager       |
| - Channel lists   |                                          | - M3U Parser           |
| - Search/Favs     |                                          | - Xtream Client (v0.2) |
| - Player controls |                                          | - EPG (v0.3)           |
| - Settings        |                                          | - DVR Scheduler (v0.4) |
+-------------------+                                          | - Storage (SQLite)     |
                                                               | - Playback (libmpv)    |
                                                               +-----------+------------+
                                                                           |
                                                                           | Native embed (HWND)
                                                                           v
                                                                  +-------------------+
                                                                  |   libmpv Player   |
                                                                  |                   |
                                                                  | - decode/render   |
                                                                  | - buffering       |
                                                                  | - tracks/subs     |
                                                                  +-------------------+
```

---

## Runtime Model

OpenTV runs as a single desktop app:

- **UI:** WebView hosting React
- **Backend:** Rust process (Tauri) that owns:
    - persistence
    - playlist ingestion
    - caching/refresh
    - playback control
    - event emission to UI

### Golden Rule

> The UI should not parse large playlists, fetch Xtream data, or do heavy work.  
> UI sends *intents*; backend returns *state*.

---

## Suggested Repo / Module Layout

```
OpenTV/
  src-ui/
    src/
      components/
      pages/
      state/
      lib/
  src-tauri/
    src/
      main.rs
      app/
      playback/
      sources/
        m3u/
        xtream/        # (v0.2)
      epg/             # (v0.3)
      dvr/             # (v0.4)
      storage/
      settings/
      events/
  docs/
    ARCHITECTURE.md
    ROADMAP.md
    DECISIONS.md
```

---

## Backend Modules

### playback/ (libmpv wrapper)

Responsibilities:

- Create and manage a single `mpv_handle`
- Embed mpv output into a native child window (**HWND** on Windows)
- Playback commands:
    - play / stop / pause
    - seek (when available)
    - volume / mute
    - track selection (audio/subtitles later)
- Emit playback events:
    - state changes: `loading`, `playing`, `paused`, `stopped`, `error`
    - optional stats: fps, dropped frames, codec (nice for debugging)

**Rule:** mpv runs “native”; React never talks to mpv directly—only through backend commands/events.

---

### sources/ (Source manager + implementations)

Provides a common interface for content sources:

- **M3U** playlists (v0.1)
- **Xtream Codes** (v0.2)
- future sources later

#### Source abstraction (concept)

All sources should support these operations:

- `list_groups(source_id)` → groups/categories
- `list_channels(source_id, group_id, query, favorites_only)` → channel list (paged/filtered)
- `resolve_stream(channel_id)` → stream URL + optional headers
- `refresh(source_id)` → update cached data (no-op for local M3U)

The UI is built against normalized groups/channels, so adding Xtream does not require a UI rewrite.

---

### storage/ (SQLite)

Responsibilities:

- Persist:
    - sources
    - groups
    - channels
    - favorites
    - recents
    - settings
    - cached Xtream results (v0.2)
- Migrations + schema versioning
- Fast queries for:
    - group filtering
    - search
    - favorites-only
    - recents

---

### settings/

Single typed settings object:

- playback preferences (hwdec, buffer preset)
- UI preferences (start on last channel, last view)
- refresh policies (Xtream/EPG intervals later)

Settings should be:
- validated
- versioned/migrated
- safe defaults

---

### events/

Backend emits events to UI for reactive updates:

- `sources_updated`
- `groups_updated(source_id)`
- `channels_updated(source_id)`
- `playback_state_changed`
- `playback_stats` (optional)
- `toast/error` notifications

UI should subscribe instead of polling.

---

## Frontend Architecture

### State Model (recommended)

Use a predictable store (Zustand or Redux Toolkit—either works):

- `sourcesState` (list, selected source)
- `groupsState` (selected group)
- `channelsState` (list, search query, favorites, recents)
- `playerState` (now playing, playback state, volume, fullscreen)

Frontend fetches data via backend commands and listens to events to refresh minimal state.

Example commands (names illustrative):

- `invoke("sources_list")`
- `invoke("groups_list", { sourceId })`
- `invoke("channels_list", { sourceId, groupId, query, favoritesOnly })`
- `invoke("play_channel", { channelId })`

---

## Data Model (Normalized)

These are conceptual shapes; you can implement as Rust structs + DB rows.

### Source

- `id`
- `type`: `m3u` | `xtream`
- `name`
- `config` (URL, auth, etc.)
- `last_refreshed_at`

### Group

- `id`
- `source_id`
- `name`
- `order`

### Channel

- `id`
- `source_id`
- `group_id`
- `name`
- `logo_url` (optional)
- `tvg_id` / `tvg_name` (optional)
- `stream_key` (internal handle used to resolve the stream)
- `is_favorite`

### Stream (resolved at play time)

- `url`
- `headers` (optional; future-proof for Xtream)
- `user_agent` (optional)
- `protocol_hints` (optional)

**Future-proofing tip:** store `headers` and `user_agent` in the model now even if M3U doesn’t need them—Xtream often will.

---

## Core Flows

### M3U Import (v0.1)

1. UI: user adds playlist (URL/file)
2. Backend:
    - downloads/reads playlist
    - parses EXTINF + tags
    - normalizes groups/channels
    - persists to SQLite
3. Backend emits `channels_updated`
4. UI updates the channel list

### Playback

1. UI calls `play_channel(channel_id)`
2. Backend:
    - resolves a `Stream`
    - configures mpv options (hwdec, cache/buffer)
    - calls mpv `loadfile`
3. Backend emits state changes:
    - `loading` → `playing` (or `error`)
4. UI updates the now-playing panel + controls

---

## Performance Considerations

- **Virtualize channel lists** from day one (some playlists have 10k+ channels)
- Prefer **indexed SQLite queries** for:
    - `(source_id, group_id)`
    - `name LIKE ?` (search)
    - favorites/recents joins
- Debounce search input to avoid query spam
- Emit events in batches to avoid UI re-render storms
- Cache logos to disk later to reduce network churn

---

## Error Handling

- Backend commands return typed errors with:
    - short message (for UI)
    - details (for logs)
- UI shows friendly messages and stays usable:
    - “Playlist failed to load — check URL”
    - “Stream failed — try another channel”
- Always log:
    - network failures
    - parse errors
    - mpv playback errors (with code/reason)

---

## Security / Privacy Notes

- Store Xtream credentials carefully (start simple; improve later)
- Never phone home
- Never include default providers or “free channels”
- Make networking transparent (show source URLs and refresh activity)

---

## Extensibility Hooks (future)

Not in MVP, but this architecture keeps doors open:

- plugin host module (WASM or scripting)
- source providers as plugins
- theming system
- automation hooks (webhooks, Home Assistant)
- server-mode backend for multi-client sync

---

_Last updated: YYYY-MM-DD_

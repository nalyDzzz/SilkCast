# OpenTV — Architecture Decisions Log (ADR)

This document records important technical and product decisions for OpenTV.

It exists so contributors can understand *why* choices were made, what alternatives were considered, and what tradeoffs were accepted.

Each entry follows a lightweight ADR format:

- **Date**
- **Decision**
- **Context**
- **Alternatives**
- **Consequences**

---

## ADR-0001 — Windows-first Scope

**Date:** 2026-02-10

**Decision:**  
OpenTV will target Windows first and defer cross-platform support.

**Context:**  
The initial goal is to ship a polished IPTV player quickly, focusing on a single OS to reduce complexity around rendering, media playback, installers, and OS integration.

**Alternatives Considered:**
- Cross-platform from day one (Windows/macOS/Linux)
- Linux-first
- Web-only client

**Consequences:**
- Faster iteration and shipping
- Better Windows UX and performance tuning
- Architecture must avoid Windows-only assumptions where feasible
- Cross-platform work deferred to later phases

---

## ADR-0002 — Desktop-first UX

**Date:** 2026-02-10

**Decision:**  
OpenTV will ship with a desktop-first UI before introducing a TV/10-foot interface.

**Context:**  
Desktop-first layouts are easier to design, test, and iterate. TV-mode can be layered on later once playback and data models stabilize.

**Alternatives Considered:**
- TV-mode only
- Dual-mode from v0.1

**Consequences:**
- Faster MVP delivery
- Less UI surface area initially
- Layout system must be flexible enough to support TV-mode later

---

## ADR-0003 — Tauri + React for UI Shell

**Date:** 2026-02-10

**Decision:**  
Use Tauri for the desktop shell and React/TypeScript for the UI.

**Context:**  
The project benefits from rapid UI iteration, a large contributor pool, and a native backend for heavy work. Tauri provides a lightweight alternative to Electron while allowing Rust-native modules.

**Alternatives Considered:**
- WPF / WinUI (C#)
- Electron
- Qt

**Consequences:**
- Smaller binaries than Electron
- Web-dev friendly contributions
- Rust required for backend work
- mpv must be embedded via native window APIs

---

## ADR-0004 — libmpv for Playback

**Date:** 2026-02-10

**Decision:**  
Use libmpv as the playback engine.

**Context:**  
libmpv offers mature GPU acceleration, IPTV-friendly buffering, excellent codec support, and stable APIs.

**Alternatives Considered:**
- libVLC
- GStreamer
- Custom FFmpeg renderer

**Consequences:**
- Excellent playback quality
- Requires native embedding logic
- Dependency on mpv build availability for Windows

---

## ADR-0005 — Source-Abstraction Layer

**Date:** 2026-02-10

**Decision:**  
Introduce a unified Source interface to support M3U, Xtream, and future providers.

**Context:**  
Supporting multiple IPTV source types without rewriting the UI requires a normalized data model and backend abstraction.

**Alternatives Considered:**
- Separate pipelines per source type
- Hardcode M3U first and refactor later

**Consequences:**
- Slightly more upfront design work
- Easier Xtream integration
- Cleaner plugin path in the future

---

## ADR-0006 — SQLite for Local Persistence

**Date:** 2026-02-10

**Decision:**  
Use SQLite for local storage.

**Context:**  
OpenTV needs durable offline-first storage for channels, settings, cached API results, and favorites without requiring a server.

**Alternatives Considered:**
- JSON files only
- Embedded NoSQL DB
- PostgreSQL

**Consequences:**
- Simple deployment
- Strong query support
- Requires migration tooling

---

## ADR-0007 — MVP Feature Discipline

**Date:** 2026-02-10

**Decision:**  
EPG grids, DVR, plugins, and TV-mode are explicitly deferred beyond v0.1.

**Context:**  
Early success depends on shipping a stable player quickly rather than chasing feature completeness.

**Alternatives Considered:**
- Build EPG immediately
- Include DVR in MVP
- Add plugin system early

**Consequences:**
- Faster initial release
- Cleaner feedback loops
- More visible phased roadmap

---

## ADR-0008 — No Bundled Content or Providers

**Date:** 2026-02-10

**Decision:**  
OpenTV will not ship with any IPTV providers, playlists, or scraping tools.

**Context:**  
Maintaining a neutral, legal client is essential for project longevity and distribution.

**Alternatives Considered:**
- Bundle public playlists
- Include scraping modules

**Consequences:**
- Reduced legal risk
- Clear project positioning
- Slightly higher friction for new users

---

## ADR-0009 — UI as Thin Client

**Date:** 2026-02-10

**Decision:**  
All heavy logic (parsing, caching, networking, playback control) lives in the backend; the UI remains a thin presentation layer.

**Context:**  
This improves performance, testability, and keeps React focused on rendering.

**Alternatives Considered:**
- Parse playlists in the UI
- Hybrid model

**Consequences:**
- More IPC calls
- Cleaner architecture
- Easier to evolve backends

---

## ADR-0010 — Public Roadmap & Issue-Driven Planning

**Date:** 2026-02-10

**Decision:**  
Roadmap phases and milestones will be tracked publicly through docs and GitHub Issues.

**Context:**  
Transparency encourages community trust and contributions.

**Alternatives Considered:**
- Private planning docs
- Ad-hoc task lists

**Consequences:**
- Higher contributor engagement
- Visible progress
- Requires ongoing grooming

---

_End of current ADR log._

# OpenTV

**OpenTV** is a modern, open-source IPTV player for Windows.

It focuses on fast, GPU-accelerated playback, a clean desktop-first experience, and transparent, privacy-respecting design.

> OpenTV is a client only.  
> It does not include any channels, providers, or scraping tools.

---

## ✨ Features

### Available / In Progress
- Windows-first desktop application
- Hardware-accelerated playback via **libmpv**
- M3U playlist import (file + URL)
- Channel groups, search, favorites, recents
- Desktop-first three-pane layout
- Local persistence (SQLite)
- Clean settings panel (buffering, hw decode, startup behavior)

### Planned
- Xtream Codes support
- XMLTV EPG + guide grid
- DVR & time-shift
- TV / couch mode UI
- Multi-view layouts
- Plugin system

See the full roadmap in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 🧭 Why OpenTV?

Most IPTV apps on Windows are:

- outdated
- closed-source
- ad-heavy
- poorly maintained
- missing DVR or EPG
- unclear about networking or privacy

OpenTV aims to be:

- 🔓 open-source
- ⚡ fast
- 🧼 transparent
- 🎯 focused on UX
- 🧑‍💻 contributor-friendly

---

## 🖥️ Tech Stack

- UI: React + TypeScript
- Desktop shell: Tauri
- Backend: Rust
- Playback: libmpv
- Storage: SQLite

Architecture details live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🚀 Getting Started (Development)

> These instructions are for contributors and developers.  
> End-user installers will be provided later.

### Prerequisites

- Windows 10 or newer
- Node.js (LTS)
- Rust toolchain
- mpv development libraries for Windows
- Tauri prerequisites

### Clone

```
git clone https://github.com/your-org/opentv.git
cd opentv
```

### Run in dev mode

```
npm install
npm run tauri dev
```

---

## 🗺 Roadmap Highlights

- **v0.1** — M3U MVP
- **v0.2** — Xtream support
- **v0.3** — EPG grid
- **v0.4** — DVR / time-shift

---

## 🤝 Contributing

Contributions are welcome!

Ways to help:

- playback improvements
- UI polish
- documentation
- testing on real playlists
- Windows packaging
- EPG heuristics

Check GitHub Issues labeled:

- `good first issue`
- `help wanted`
- `area:ui`
- `area:playback`

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

---

## ⚖ Legal / Ethics

OpenTV is a **media client only**.

- No IPTV providers or playlists are bundled.
- No scraping modules are included.
- Users must supply their own legally obtained sources.

---

## 📄 License

TBD (likely MIT or Apache-2.0).

---

## 🌟 Screenshots

Coming soon.

---

## 💬 Community

- GitHub Discussions (planned)
- Discord (planned)

---

## 📌 Status

OpenTV is in early development.

Stars, feedback, and contributors are very welcome ⭐

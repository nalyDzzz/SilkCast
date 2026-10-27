# SilkCast design direction

In October 2026 we compared three rendered directions for the post-v0.2.0 UI. We chose a hybrid:

- **Base: Direction A, "Mulberry" (cinematic).** Plum-black surfaces, one mulberry accent, warm ivory text,
  Bodoni Moda italic for display titles, and Onest for the UI. There is no sidebar; a top bar carries the
  navigation, global search, and the source switcher. Every progress indicator is the *silk thread*: a hairline
  with a glowing bead at the playhead.
- **From Direction B, "On Air" (broadcast guide):** the Live TV guide view. A red-turned-mulberry *NOW line*
  crosses each channel's timeline lane.
- **From Direction C, "Studio":** the Ctrl K command palette. It jumps to any channel, movie, series, or group,
  and runs actions such as Refresh guide.
- **App icon: "Thread".** An italic S drawn as one silk thread, ending in the progress bead, with a simplified
  drawing for 16–32 px.

Open the HTML files in a browser. Each one is self-contained, and its mock screens have an "Actual size" toggle.

| File | What it shows |
| --- | --- |
| [`direction-a-mulberry.html`](direction-a-mulberry.html) | Home, Live TV (theatre), movie details, components, tokens |
| [`direction-b-on-air.html`](direction-b-on-air.html) | Home, Live TV guide with the NOW line, series details, tokens |
| [`app-icon-concepts.html`](app-icon-concepts.html) | The three icon concepts at real Windows sizes |

The mockups use invented channels, programmes, and artwork. The implemented tokens live in `src/App.css`.

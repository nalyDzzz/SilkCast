# Smoke Tests

## Embedded Player

Run from repo root:

```powershell
npm run tauri dev
```

Checklist:

- App launches and no external mpv window appears.
- Click a channel `Play` and confirm:
  - video appears inside the in-app player area,
  - audio plays,
  - status changes to `playing`.
- Click `Stop` and confirm:
  - playback stops,
  - status changes to `stopped`,
  - player overlay shows idle prompt.
- Scroll the page up/down while playing and confirm the video stays aligned with the player panel (no floating surface).
- Resize the app window while playing and confirm the video resizes with the player panel.
- Click `Fullscreen` and confirm:
  - player enters fullscreen,
  - video remains visible,
  - `Exit Fullscreen` returns to normal layout.
- Pause/Resume still work after toggling fullscreen.

Optional debug checks (dev builds):

- Watch terminal logs for `[embedded-surface]` messages.
- Confirm create/move/destroy logs appear when starting playback, resizing, and closing app.

# LLM Notes

## Frontend React Practices
- Prefer modern React best practices.
- Avoid using `useEffect` by default; only use it when there is a real side effect (e.g., subscriptions, timers, imperative integrations, syncing external systems).
- Favor derived state, event handlers, memoization, and clear data flow before reaching for `useEffect`.

## UI Components
- We use shadcn/ui components.
- Prefer existing shadcn/ui components and composition over building custom components from scratch when a suitable option exists.

## Code Organization
- Do not generate monolithic files.
- Split code into smaller, focused components/modules where it improves readability and maintainability.
- Keep responsibilities separated and colocate related files when it makes sense.

## Testing
- When developing a feature, write tests for that feature when it makes sense.

## Design System
- Read `docs/design/README.md` before visual work; it records the chosen direction and links the mockups.
- Colours come from the Mulberry tokens in `src/App.css` (shadcn names plus `--thread`, `--sheen`, `--live`); style with token utilities such as `bg-primary`, `text-thread`, `text-live`.
- Display provider names through `cleanName()` (`src/lib/catalog/cleanName.ts`) and `TagBadges`; keep raw names for search, playback and storage.
- Progress is always `ThreadProgress`. Titles (hero, details, page headers) use `font-display-italic`; everything else uses the default Onest.
- App icons are generated: edit `src-tauri/icons/source/*.svg`, then run `npm run build:icons`.

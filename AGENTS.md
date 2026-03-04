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

# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript frontend (entry: `src/main.tsx`, app shell: `src/App.tsx`).
- `src-tauri/`: Rust/Tauri desktop backend (`src-tauri/src/main.rs`, `src-tauri/src/lib.rs`).
- `public/`: static assets served by Vite.
- `docs/`: architecture and roadmap docs (`docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`).
- Root config: `package.json`, `vite.config.ts`, `tsconfig*.json`, and Tauri config in `src-tauri/tauri.conf.json`.

## Build, Test, and Development Commands
- `npm install`: install frontend and Tauri JS dependencies.
- `npm run dev`: run the Vite web UI on port `1420` for frontend-only work.
- `npm run tauri dev`: run the full desktop app (React + Rust backend).
- `npm run build`: type-check with `tsc` and build production frontend assets.
- `npm run tauri build`: build desktop binaries via Tauri.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests (when present).

## Coding Style & Naming Conventions
- TypeScript/React: 2-space indentation, double quotes, functional components, hooks-first patterns.
- Rust: follow `rustfmt` defaults (4-space indentation, snake_case for functions/modules).
- Naming:
  - React components: `PascalCase` (example: `ChannelList.tsx`).
  - Utility/module files: `camelCase` or domain-based names.
  - Rust commands exposed to Tauri should use clear verb names (example: `play_channel`).
- Before submitting, run `npm run build` and `cargo fmt --manifest-path src-tauri/Cargo.toml`.

## Testing Guidelines
- No formal frontend test runner is configured yet; add tests with feature work where practical.
- Prefer small, deterministic unit tests in Rust and UI behavior tests once a JS test framework is added.
- Test file naming:
  - Rust: inline `mod tests` or `*_tests.rs`.
  - Frontend (future): `*.test.ts(x)` next to source files.

## Commit & Pull Request Guidelines
- Current history uses concise, imperative commit subjects (example: `Initialize Tauri project...`); keep subject lines specific and action-oriented.
- Recommended commit format: `<area>: <imperative summary>` (example: `ui: add channel search input`).
- PRs should include:
  - clear summary and scope,
  - linked issue(s),
  - screenshots/GIFs for UI changes,
  - verification notes (commands run, platforms tested).
- Keep PRs focused; split unrelated frontend/backend refactors into separate PRs.

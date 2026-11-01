# Notes for agents working on Wakefield

Read `docs/design.md` first, then `docs/world-bible.md` and `docs/rules.md` when touching content or the GM.

## Platform rules (Spacefast Zero)

- Routes are files in `pages/` (each starts with `"use client"` and wraps a screen from `client/screens/`). `client/index.tsx` exports only `Layout`.
- `server/` may import only `@spacefast/zero/server`, `preact`, and relative files. No npm packages server-side, so call the Claude API with raw `fetch`.
- `shared/` imports only its own files (with `.ts` extensions so `node --test` works). Never put tests in `shared/`: the compiler bundles everything there. Tests live in `tests/`.
- Tailwind class names must be static strings. Use the semantic tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `accent`, `success`, `warning`, `danger`). The dark palette is pinned in `client/index.tsx`.
- Queries are live, but **every mutation must call `ctx.invalidate(...LIVE_QUERIES)`** (see `server/index.ts`). Without it, only the device that made the change refreshes. Add any new query name to `LIVE_QUERIES`.
- Production realtime delivery drops some change notifications, so the game screens use `useResilientQuery` (`client/ui.tsx`), which also re-subscribes every few seconds and on focus. Use it for any screen that must follow the game state.
- Table fields are `string/number/boolean/id/userId`. Store structured data as JSON strings (`statsJson`, `resultJson`, `dataJson`).
- Outbound fetch budget: ~5 s in mutations and actions, ~10 s per fetch in queries and read endpoints. That's why the GM runs in a read endpoint and returns an HMAC-signed beat (see design doc).

## Game rules in code

- All rules math lives in `shared/rules.ts`; all content in `shared/content.ts`; adventures in `shared/adventures.ts`.
- Every GM beat, from the AI or the backup narrator, passes through `sanitizeBeat` in `shared/gm.ts`. Keep it strict.
- Whispers must never reach the table screen (`tableView` filters them server-side).

## Commands

```sh
npm test            # unit tests (node:test)
npm run typecheck
npm run dev         # sf dev; add ?guest=<name> to URLs to simulate different players
node tests/e2e.cjs /path/to/sf-dev-output.log
sf publish --space wakefield --team shaun-team   # live at https://wakefield.space.fast
```

Before publishing, move `.env.server` aside so the local dev signing key isn't uploaded; production secrets are set with `sf env set`.

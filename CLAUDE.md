# Notes for agents working on Wakefield

Read `docs/design.md` first, then `docs/world-bible.md` and `docs/rules.md` when touching content or the GM. **Any UI change follows `docs/design-system.md`**: tokens in `client/design.ts`, components in `client/ui.tsx`. Use the `TYPE` roles and existing components; no rounded corners, shadows, or new colors.

## Platform rules (Spacefast Zero)

- Routes are files in `pages/` (each starts with `"use client"` and wraps a screen from `client/screens/`). `client/index.tsx` exports only `Layout`.
- `server/` may import only `@spacefast/zero/server`, `preact`, and relative files. No npm packages server-side, so call the Claude API with raw `fetch`.
- `shared/` imports only its own files (with `.ts` extensions so `node --test` works). Never put tests in `shared/`: the compiler bundles everything there. Tests live in `tests/`.
- Tailwind class names must be static strings. Use the semantic tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `accent`, `warning`, `danger`). They're pinned to `client/design.ts` by `client/index.tsx`.
- Queries are live, but **every mutation must call `ctx.invalidate(...LIVE_QUERIES)`** (see `server/index.ts`). Without it, only the device that made the change refreshes. Add any new query name to `LIVE_QUERIES`.
- Read data with `useLiveQuery(name, args, refreshMs?)` from `client/ui.tsx`, never `useQuery` directly. It subscribes fresh on every mount (cached results from before a navigation were the stale-list bug), shows the last-known value instantly (no blank screens), and with `refreshMs` re-subscribes on an interval because production realtime drops some cross-device notifications.
- Table fields are `string/number/boolean/id/userId`. Store structured data as JSON strings (`statsJson`, `resultJson`, `dataJson`).
- Outbound fetch budget: ~5 s in mutations and actions, ~10 s per fetch in queries and read endpoints. That's why the GM runs in a read endpoint and returns an HMAC-signed beat (see design doc).

## VR room

- `/vr/<code>` (`pages/vr/[code].tsx` → `client/screens/VrRoom.tsx`) is a WebXR room: shared screen, table, a seat per player, your console, a throwable d20. The 3D code lives in `client/vr/` (plain three.js, no React).
- Zero bundles reject dynamic `import()`, so `loadThree()` in `client/vr/room.ts` injects a module script that loads three.js from jsDelivr. Keep it off the phone bundle.
- It reads the same live queries as the phone and table (`playerView`, `tableView`) and runs the GM driver when the viewer is host, so an all-headset table works without an iPad.
- No DOM to click inside it, so bots and tests drive it through `window.wfVR` (see `tests/sim/run.cjs`).
- WebXR needs HTTPS: test in a headset against the published Space, not the LAN dev server.
- "Watch a sim game in 3D" (home → `/sim`) works in production: `addSimCrew` seats bot characters (owner/seat `userId` is `bot:<campaignId>:<n>`), and the host's VR room calls `simStep` every few seconds so one bot moves or rolls. Bot moves go through the same `declareAction` as players.

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
npm run sim         # watch bots play: iPad table, iPhones, and a headset player in the 3D room (--players a,b --vr dee --speed 2 --manual --headless)
sf publish --space wakefield --team shaun-team   # live at https://wakefield.space.fast
```

Before publishing, move `.env.server` aside so the local dev signing key isn't uploaded; production secrets are set with `sf env set`.

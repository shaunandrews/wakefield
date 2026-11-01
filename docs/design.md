# Wakefield — Product & Technical Design

Companion docs: [World Bible](world-bible.md) · [Rules](rules.md)

## 1. Product

**Wakefield** is a tabletop RPG for a group in the same room:

- **One shared screen** (an iPad propped in the middle of the table) shows the story, the crew, the dice, and the prompt.
- **Every player uses their phone** to declare actions, roll dice, read their sheet, and receive private *whispers*.
- **An AI Game Master** (Claude) narrates, voices NPCs, calls for checks, and applies consequences. When no API key is configured, or the AI call fails, a **backup narrator** keeps the game moving.

### Core loop (a "beat")

```
 ┌───────────── table screen ─────────────┐     ┌──── phones ────┐
 │ 1. GM narration + "What do you do?"    │ ──▶ │ 2. declare      │
 │                                        │ ◀── │    actions      │
 │ 3. all ready → GM resolves:            │     │                 │
 │    narration, checks, whispers         │ ──▶ │ 4. tap d20      │
 │ 5. dice land big on screen             │ ◀── │                 │
 │ 6. GM narrates outcomes, applies harm  │     │                 │
 └────────────────────────────────────────┘     └─────────────────┘
```

Campaign `phase` drives the UI everywhere: `lobby → actions → (rolls → outcome) → actions … → ended`.

### Screens

| Route | Device | Purpose |
|---|---|---|
| `/` | any | Home: your name, sign-in, characters, campaigns |
| `/characters/new` | phone | Ready-made characters (one tap + optional rename); "Build your own" is 3 steps (origin, calling, name) |
| `/characters/:id` | any | Character sheet |
| `/host` | iPad | Create a campaign and pick an adventure |
| `/table/:code` | iPad | Lobby (QR + code) → the shared game screen |
| `/join`, `/join/:code` | phone | Scan or enter code → tap a character (yours or ready-made) → you're seated. QR to seated in 2 taps. |
| `/play/:code` | phone | Player controller: Play / Sheet tabs; suggested moves, Help, Hold, abilities, rolls with stakes |

## 2. Architecture

Wakefield is a single **Spacefast Zero** app (TypeScript + Preact + Tailwind, MySQL, live queries):

```
pages/          route files ("use client"), thin wrappers around screens
client/         Preact UI (screens/, components/, ui.tsx, index.tsx Layout)
server/         index.ts — capsule: schema, queries, mutations, endpoints
                gm.ts    — AI GM prompt + Claude Messages API call
shared/         pure TS shared by both sides (no imports outside shared/)
  content.ts    origins, callings, backgrounds, skills, drives
  rules.ts      the Wake System: sheets, checks, outcomes, codes
  adventures.ts authored adventures (scenes, NPCs, GM notes)
  gm.ts         GM beat contract, sanitizer, backup narrator
  views.ts      shapes the server returns to the client
tests/          node:test unit tests for shared/ + a Playwright e2e script
docs/           this, the world bible, and the rules
```

### Realtime

Zero queries are **live**: every mutation calls `ctx.invalidate(...)` for all live queries, the platform broadcasts a change event, and other browsers re-run their subscriptions. The table and phones subscribe to `tableView(code)` / `playerView(code)`.

**Known platform issue (Nov 2026):** on the live space, realtime delivery drops some change notifications (the server records every change, but other devices receive only some). The game screens therefore use `useResilientQuery`, which also re-subscribes every ~4 s and whenever the screen regains focus. Remove it if Spacefast fixes delivery.

### Identity & accounts

- Every visitor is a **guest** with a stable `userId` (Zero auth). That's enough to play.
- Players can **sign in** (Google via Zero auth) to keep characters across devices. Fields declared with `userId()` migrate with the guest upgrade.
- A `profiles` row stores the player's table handle.
- The **host** is the account that created the campaign (`campaigns.hostId`). Only the host's screen can drive the GM.

### Data model

| Table | Key fields |
|---|---|
| `profiles` | userId, handle |
| `characters` | ownerId, name, origin/variant, calling, background, statsJson, vigor, charge, xp, level, scars |
| `campaigns` | code, hostId, adventure, sceneIndex, phase, beat, mode, prompt, summary, logSeq, gmBusy |
| `seats` | campaignId, userId, characterId, active |
| `log` | campaignId, seq, kind, text, who, audience (`all` or a userId for whispers), dataJson |
| `actions` | campaignId, beat, characterId, text |
| `checks` | campaignId, beat, characterId, skill, difficulty, edge, rolled, resultJson |

Whispers are filtered **server-side**: `tableView` never returns them, and `playerView` returns only the viewer's own.

### The AI GM pipeline

Zero handlers have tight outbound-fetch budgets (a mutation or action gets ~5 s; a **read** endpoint gets ~10 s per fetch). So:

1. Table calls mutation `beginGm(code)` to take a lock.
2. Table `POST /api/gm/beat` (a *read-only* endpoint). The server builds the context (scene, party sheets, story summary, recent log, actions or roll results), calls Claude with **structured output** (JSON schema), sanitizes the result, and **HMAC-signs** it with `GM_SIGNING_KEY`.
3. Table calls mutation `applyGmBeat(code, beat, payload, signature)`. The server verifies the signature and beat number, then applies narration, whispers, effects, checks, and scene changes in one transaction.
4. On any failure, the table calls `runBackupBeat(code, reason)` and the deterministic narrator runs inside the mutation.

The signature means a player with dev tools can't forge GM output, and the beat number makes the result single-use.

Model: `claude-opus-5-5` at `low` effort by default (env `GM_MODEL`, `GM_EFFORT`), with server-side refusal fallbacks enabled. The system prompt is static and cached. If beats routinely time out, lower latency with `GM_MODEL=claude-haiku-5-5` or `claude-sonnet-5-5`.

### Configuration (Space environment variables)

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for AI GM | Claude API key (secret) |
| `GM_SIGNING_KEY` | for AI GM | random 32-byte hex; signs GM beats (secret) |
| `GM_MODEL` | no | override the GM model |
| `GM_EFFORT` | no | `low` (default) / `medium` / `high` |

## Deployment

Live at **https://wakefield.space.fast** (team `shaun-team`, public access). `GM_SIGNING_KEY` is set as a secret; set `ANTHROPIC_API_KEY` to turn on the AI GM.

## 3. What's built (foundation)

- World bible, rules, and one complete 3-scene adventure (*The Quiet Light*)
- Guest identity + Google sign-in; player handles
- Character creator for all 7 origins × 6 callings × 9 backgrounds; character sheets
- Campaign hosting with 4-letter codes + QR join
- Table screen: lobby, story log, crew panel (Vigor/Charge/ready/check status), dice overlay, host controls
- Phone controller: declare actions (with ability shortcuts), roll checks, sheet, story with private whispers
- AI GM via Claude with signed beats, plus the offline backup narrator
- Scene progression, XP on scene/adventure completion, rest, end campaign
- Unit tests for rules, content integrity, GM sanitizing, and the backup narrator; a Playwright e2e script

## 4. Roadmap

**Next up**
1. **Level-up flow**: spend XP (new abilities, stat bumps).
2. **Portraits**: generated or preset art per origin/calling (Zero storage for uploads).
3. **Scene art & ambience on the table**: per-scene backgrounds, tide-siren sounds, dice audio.
4. **Voice narration**: text-to-speech on the table screen.
5. **Enemy tracker**: GM-maintained enemies with Threat/Harm/Toughness shown on the table during combat.
6. **AI-generated adventures**: the GM drafts a new adventure (same `Adventure` shape) from a premise the table picks.
7. **Campaign continuity**: carry the story summary and consequences between adventures; faction reputation.
8. **More adventures**: hand-written starters for each district.
9. **Player safety tools**: an X-card button on phones that tells the GM to steer away, plus lines-and-veils settings per campaign.
10. **Reconnect polish**: presence indicators and handling for a phone that sleeps mid-roll.

**Open questions**
- Should players be able to edit an action after the GM starts resolving? (Today: no.)
- Should the host be able to edit or retcon a GM beat?
- How public should campaigns be? (Today: anyone with the code can view the table and join.)

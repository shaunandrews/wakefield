# Wakefield — Design Vision & System

Companion docs: [World Bible](world-bible.md) · [Design (product & tech)](design.md)
Implementation: `client/design.ts` (tokens) · `client/ui.tsx` (components) · `client/index.tsx` (global layer)

---

## 1. Vision: *Signal in the Tide*

Wakefield's interface is **the city's own terminal**: the kind of low-power, salt-scarred display a dock crew, a Woken lighthouse, or a courier crow would actually use. It's dark because the game is played at night around a table. It's sparse because the story is the spectacle, not the chrome.

Picture a single cyan cursor blinking on black glass, and everything else drawn in thin lines.

**Three feelings we design for:**

1. **Quiet until it matters.** The interface stays nearly invisible during narration, then snaps into sharp focus at moments of consequence: a roll, a whisper, a character going Down.
2. **Machine-readable, human-felt.** The frame speaks like a system (labels, codes, numbers). The story speaks like a person (warm, readable prose). That contrast is the setting: humans and machines sharing one city.
3. **Everyone at a glance.** From across the table, the shared screen must be legible: who's ready, who's hurt, what the dice said.

---

## 2. Principles

| # | Principle | In practice |
|---|---|---|
| 1 | **Line, not fill** | Structure comes from 1px hairlines and whitespace. Filled surfaces are reserved for overlays and the single primary action. |
| 2 | **One signal** | One accent color, cyan. It means *live, interactive, yours, or good*. If two things are cyan, they should be related. |
| 3 | **Two voices** | Monospace for the system (labels, controls, numbers). Sans-serif for the story (narration, descriptions). Never mix them in one string. |
| 4 | **Color is state** | Caution (amber) and alarm (red) appear only when the game state calls for them: Mixed results, harm, misses, Down. Never decoratively. |
| 5 | **Sharp, flat, still** | No rounded corners, shadows, glows, gradients, or blur. Motion is limited to a blinking cursor and state changes. |
| 6 | **Numbers are heroes** | Dice, Vigor, and codes get the largest, boldest treatment. Use tabular figures and zero-pad where it aids scanning (`03/03`, `01·03`). |
| 7 | **The story is the screen** | On the table, narration takes the most space and the most readable type. Everything else steps back. |
| 8 | **Every element earns its place** | An element stays only if a player uses it to decide or to feel something at that moment. Decoration posing as status ("sys.online"), labels that restate the obvious, and controls for things that happen automatically are cut. |
| 9 | **One action per state** | Each screen state has at most one primary button. Secondary actions live in a menu, appear only when the game is stuck, or disappear. |

---

## 3. Voice (interface copy)

The interface speaks in **plain, short words**; the GM and the story speak in **warm sentences**. The cyber feel comes from type, line and color, not from jargon.

| Context | Do | Don't |
|---|---|---|
| Section labels | Only where needed: `Play as`, `Abilities` | `// GM`, `// Kestrel · input` |
| Status | `ready`, `deciding`, `rolling`, `down`, `Waiting on Ben` | `…`, `gm transmitting` |
| Stats | `Vigor 9/11`, Charge as pips, `Hard` | `VIG`, `CHG`, `DC16` |
| Errors | `That roll has expired.` Never raw server errors in the room. | "Oops! Something went wrong." |
| Buttons | Verbs: `Join a table`, `Play as Kestrel`, `Lock it in` | "Submit", "OK" |
| Narration | Full sentences, no numbers or outcome labels | "(Mixed, 9 vs 12)" |

No emoji in the interface. A trailing blinking underscore (`_`) means *live / waiting*.

---

## 4. Tokens

### 4.1 Color

| Token | Hex | Tailwind | Role |
|---|---|---|---|
| `canvas` | `#050607` | `bg-canvas` | The page. Near-black, cold. |
| `surface` | `#0b0d10` | `bg-surface` | Overlays and menus only. |
| `line` | `#1c2127` | `border-line`, `bg-line` | Hairlines, dividers, empty meter segments. |
| `ink` | `#d9e1e8` | `text-ink` | Primary text. |
| `muted` | `#717d89` | `text-ink-muted` | Labels, metadata, secondary text. |
| `signal` | `#2df5d0` | `accent` (`text-accent`, `bg-accent`, `border-accent`) | The one accent. Interactive, live, yours, success. |
| `caution` | `#f5c22d` | `warning` | Mixed results, harm taken, system notices. |
| `alarm` | `#ff3d6e` | `danger` | Misses, glitches, Down, destructive actions. |

Rules:
- Text on `signal` fill is always `canvas`.
- `caution` and `alarm` never appear as large fills except the danger button's hover.
- Contrast on `canvas` (WCAG): `ink` 15.3:1 · `signal` 14.6:1 · `caution` 12.2:1 · `alarm` 5.9:1 · `muted` 4.8:1. All pass AA for body text; on `surface`, `muted` is 4.6:1.

### 4.2 Typography

Two families, loaded from Google Fonts:

- **JetBrains Mono** (400/500/700): the system voice. Slashed zero on.
- **IBM Plex Sans** (400/500): the reading voice. Apply it with the `wf-read` class.

**Type roles** (`TYPE` in `client/design.ts`). Use a role; don't hand-compose size, case, and tracking.

| Role | Spec | Use |
|---|---|---|
| `label` | mono 11px, caps, tracking .25em, muted | Section headers, only where a section's purpose isn't obvious |
| `meta` | mono 11px, caps, tracking .15em, muted | Metadata lines under names |
| `status` | mono 11px, caps, tracking .2em | `ready`, `down`, `rolling_` |
| `name` | mono, sentence case, ink | Character, campaign, and option names |
| `title` | mono 24px, sentence case | Screen titles, character name on sheet |
| `display` | mono bold, tabular, leading-none | Dice faces, table codes, roll totals |
| `body` | sans 15px, relaxed | Phone story text, descriptions |
| `bodyMuted` | sans 14px, relaxed, muted | Secondary prose, taglines |
| `narration` | sans 20px → 26px on tablet, leading 1.55 | Shared-screen story |

Buttons and labels use mono caps with tracking. Everything a player reads twice (names, prompts, moves) is sentence case.

### 4.3 Space & layout

- **Base unit 4px** (the Tailwind scale). Common gaps: 8 (`gap-2`), 12 (`gap-3`), 24 (`gap-6`).
- **Phone:** single column, max width 576px (`max-w-xl`), 16px gutters, fixed bottom tab bar.
- **Shared screen:** full-height three-band layout (header / story + crew rail / prompt footer). The crew rail is 300px. The story column is capped at 768px for line length.
- **Hairlines everywhere:** borders are always 1px. Group with `border-t` dividers before reaching for boxes.

### 4.4 Shape & depth

- Radius: **0**, everywhere, including inputs.
- Shadows, glows, blur, gradients: **none**.
- Emphasis comes from the **frame**: `wf-frame` draws two signal-colored corner ticks (top-left, bottom-right) on the one element that needs attention right now (the dice overlay, a pending roll, the join code).

### 4.5 Motion

| Motion | Spec | Use |
|---|---|---|
| Cursor blink | `wf-blink`, 1s steps(1) | Live / waiting indicators, the logo cursor |
| State color | `transition-colors` (~150ms) | Hover, focus, selection |
| Dice hold | overlay for 2.6s | A roll landing on the table |

Nothing slides, bounces, or scales. Respect the stillness.

### 4.6 Texture

`wf-scan` (faint 3px scanlines) is reserved for the **dice overlay**, the one moment the screen behaves like a CRT. Don't use it elsewhere.

---

## 5. Components

All live in `client/ui.tsx` unless noted.

| Component | Anatomy | Notes |
|---|---|---|
| **Label** | `label` role | Only when a section's purpose isn't obvious from its content. |
| **Logo** | `WAKEFIELD` + signal `_` | Top-left of every screen. |
| **TopBar** | Logo or `‹ back` · title · right slot, bottom hairline | One per screen. |
| **Btn** | Mono caps, 1px border | `accent`: solid signal, inverts on hover. **Disabled = line outline + muted text, never a dimmed fill**: a filled signal button always means "tap me". `ghost`: line border. `danger`: alarm outline. Busy shows a blinking `▮`. |
| **Field** | `FIELD` class: transparent, 1px line, signal on focus | Inputs and textareas. Use the reading voice for long free text (actions). |
| **Choice** (creator) | Bordered row: name + `[x]` when selected, details revealed below a hairline | Selection = signal border + signal name. No fills. |
| **VigorBar** | `Vigor` · segmented bar · `value/max` | One segment per point (max 20). Signal, caution at ≤50%, alarm at ≤25%. |
| **Pips** | Small squares, filled = available | Small pools (Charge ≤ 5). Sits beside the name. |
| **Moment** | Full-screen scanlines + framed panel | The one pattern for big beats: dice, scene title cards, the ending. Tap to dismiss. |
| **Move button** (phone) | Full-width row: move text (reading voice) + skill (muted) | Suggested moves; one tap locks in. |
| **OutcomeBadge** | Mono caps in a 1px box | Surge = solid signal. Success = signal outline. Mixed = caution. Miss/Glitch = alarm. |
| **ErrorNote** | `! message`, alarm, left rule | Inline, under the control that failed. |
| **Loading** | Faint placeholder lines in the screen's shape | Never a black screen; the last-known data shows instantly while fresh data loads. |
| **CharacterCard** (`Home.tsx`) | name · origin and calling · Vigor only when hurt | Selection = signal border and signal name. |
| **Log entries** (`StoryLog.tsx`) | scene: `SCENE  TITLE ────` · narration: reading voice · action: signal rule + `> Name` · roll: `d20 Name Skill · 13 vs 12 [SUCCESS]` · whisper: dashed box `// private channel` · effect: caution `▲` · system: `— text —` | The log is the product's spine. Keep entry types visually distinct but equally quiet. |
| **Dice overlay** (`Table.tsx`) | Scanlines, framed panel, giant zero-padded die, math line, outcome word in its state color | The loudest moment in the product, by design. |

---

## 6. Surfaces

### Shared screen (iPad, landscape)
- **Lobby:** framed QR + giant table code; the adventure's pitch; crew as hairline rows (name, player); one primary action.
- **Play:** header (scene name · code · host menu) → story column + crew rail (name, player, Vigor, status word) → footer (the prompt, "Waiting on…"). Host controls appear only when the game is stuck (45s); errors live in the host menu, never on the room's screen.
- **Moments:** a title card when the adventure starts and at each new scene; the dice; the ending recap (summary + crew XP).
- Readable from about 2m away: narration ≥ 26px, meters ≥ 8px tall, outcome words ≥ 24px in the overlay.

### Phone (portrait)
- **Header:** name, Charge pips, Vigor bar. Nothing else (no logo, no code mid-game).
- **Play tab:** the last two sentences of story → your consequences → private message → the GM's prompt → three suggested moves (one tap) → "Or say what you do…" → Help / Hold → abilities. Once locked: your move + "Waiting on…" + Change.
- **Rolls:** a framed panel with the move, the modifier, the stakes ("If it goes wrong: …") and a large square `D20`. The result says what it means in words.
- **Tabs:** `PLAY · SHEET`, active tab marked by a signal top rule.

---

## 7. Accessibility

- Minimum text 10px, only for uppercase labels with wide tracking. Body text ≥ 14px on phones.
- Every state is carried by **text as well as color** (`ready`, `down`, `MISS`), never color alone.
- Touch targets ≥ 44px on phones (the d20 button is 160px).
- Focus is visible: fields switch to a signal border, buttons invert.
- Respect the 4.5:1 floor. If a token changes, re-check every pair above.
- `prefers-reduced-motion` turns off the cursor blink.

---

## 8. Don'ts

- ❌ Rounded corners, drop shadows, glows, blurred backdrops, gradients
- ❌ A second accent color, or using caution/alarm decoratively
- ❌ Emoji or illustrated icons in the interface (`▶ ▲ ▪ ●` glyphs are the icon set)
- ❌ Narration in monospace, or labels in sans
- ❌ Filled cards as the default container (use hairlines)
- ❌ Spinners (use the blinking cursor)

---

## 9. Changing the system

1. Change tokens in `client/design.ts` first; components read from there.
2. Update this document in the same change.
3. New component? Add it to §5 with its anatomy and states, built from existing roles and tokens.
4. Check the shared screen from across a room and the phone one-handed before shipping.

## 10. Roadmap for the system

- Per-scene **ambient art** on the shared screen, kept below 10% opacity behind the story
- **Faction accents** for NPC dialogue attribution (strictly desaturated, never competing with signal)
- **Sound**: tide-siren cue on scene change, a dry click on dice. Mirror the visual stillness.

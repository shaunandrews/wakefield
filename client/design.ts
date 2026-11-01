// Wakefield design tokens: the single source for color, type, and roles.
// The written system lives in docs/design-system.md. Change a value here, not
// in a component.
//
// Tailwind classes must be static strings (Zero scans source text), so the
// type roles below are complete class lists, not fragments.

/** Color tokens. Mapped onto Zero's semantic Tailwind tokens in client/index.tsx. */
export const COLOR = {
  /** Void: the page. Near-black with a cold cast. */
  canvas: "#050607",
  /** Raised surfaces (menus, overlays). Used sparingly; most structure is line, not fill. */
  surface: "#0b0d10",
  /** Hairlines, empty meter segments, dividers. */
  line: "#1c2127",
  /** Primary text. */
  ink: "#d9e1e8",
  /** Secondary text, labels, metadata. */
  muted: "#717d89",
  /** Signal: the one accent. Interactive, live, yours, success. */
  signal: "#2df5d0",
  /** Caution: mixed results, harm taken, system notices. */
  caution: "#f5c22d",
  /** Alarm: misses, danger, Down, destructive actions. */
  alarm: "#ff3d6e",
} as const;

export const FONT = {
  /** Interface voice: every label, control, number, and heading. */
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  /** Reading voice: narration, descriptions, anything longer than a line. */
  read: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap",
} as const;

/**
 * Type roles. Use these instead of composing size + case + tracking by hand.
 * Monospace roles are uppercase and tracked; reading roles are sentence case.
 */
export const TYPE = {
  /** Section label, always prefixed with "// " by <Label>. */
  label: "text-[11px] uppercase tracking-[0.25em] text-ink-muted",
  /** Metadata under a name: origin · calling · player. */
  meta: "text-[11px] uppercase tracking-[0.15em] text-ink-muted",
  /** Inline status words: ready, down, rolling. */
  status: "text-[11px] uppercase tracking-[0.2em]",
  /** Names of characters, campaigns, choices. */
  name: "uppercase tracking-[0.15em] text-ink",
  /** Screen titles. */
  title: "text-2xl uppercase tracking-[0.1em] text-ink",
  /** Hero numerals and codes: the dice, table codes. */
  display: "font-bold tabular-nums leading-none",
  /** Body copy in the reading voice. */
  body: "wf-read text-[15px] leading-relaxed text-ink",
  /** Secondary reading copy. */
  bodyMuted: "wf-read text-sm leading-relaxed text-ink-muted",
  /** Shared-screen narration: the largest reading text in the product. */
  narration: "wf-read text-xl leading-relaxed md:text-[1.6rem] md:leading-[1.55] text-ink",
} as const;

/** Standard text input / textarea. */
export const FIELD = "w-full border border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent";

/** Motion: one blink for "live", one fade for state. Nothing bounces. */
export const MOTION = {
  diceHoldMs: 2600,
  cursorBlinkMs: 1000,
} as const;

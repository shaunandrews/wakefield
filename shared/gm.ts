// The Game Master contract: what a GM beat looks like, how we sanitize one,
// and the backup narrator that runs when the AI GM is unavailable.
import { findSkill, SKILLS, type SkillKey } from "./content.ts";
import { type Adventure } from "./adventures.ts";
import { clamp, nearestDifficulty, type Outcome } from "./rules.ts";

export type Mode = "explore" | "social" | "combat";

export type GmCheck = {
  characterId: string;
  skill: SkillKey;
  difficulty: number;
  edge: "boost" | "snag" | "none";
  /** The action being attempted, in a few words. */
  reason: string;
  /** What a miss costs, in one short sentence. Shown before the roll. */
  stakes: string;
};

/** A suggested move for phones. `risky` only matters to the backup narrator. */
export type MoveOption = { text: string; skill: string; risky?: boolean; stakes?: string; done?: string };

export type GmBeat = {
  /** Read-aloud narration for the table screen. May be empty while dice are owed. */
  narration: string;
  /** Checks the GM is calling for. Players roll these on their phones. */
  checks: GmCheck[];
  /** Private information for individual players. */
  whispers: { characterId: string; text: string }[];
  /** Vigor / Charge changes to apply (harm is negative vigor). The note says what caused it. */
  effects: { characterId: string; vigor: number; charge: number; note: string }[];
  mode: Mode;
  /** "advance" ends the current scene and starts the next. */
  scene: "stay" | "advance";
  /** The question the table sees next. */
  prompt: string;
  /** Three suggested moves for the next beat. */
  options: MoveOption[];
  /** A short running summary of the story so far, for continuity and the recap. */
  summary: string;
};

export type Phase = "lobby" | "actions" | "rolls" | "outcome" | "ended";

export type ActionKind = "free" | "option" | "help" | "hold";

export type GmAction = {
  characterId: string;
  name: string;
  text: string;
  kind: ActionKind;
  /** For help: the character being helped. */
  targetId?: string;
  /** An ability the player invoked (its Charge is spent automatically). */
  ability?: string;
  /** For options: the authored skill, risk and stakes. */
  skill?: string;
  risky?: boolean;
  stakes?: string;
  done?: string;
};

/** Everything a GM (AI or backup) needs to produce the next beat. */
export type GmContext = {
  phase: Phase;
  beat: number;
  sceneBeats: number;
  mode: Mode;
  summary: string;
  adventure: Adventure;
  sceneIndex: number;
  party: PartyMember[];
  recentLog: { kind: string; text: string; who?: string }[];
  /** Actions declared this beat (phase "actions"). */
  actions: GmAction[];
  /** Results of the checks called last beat (phase "outcome"). */
  rolls: {
    characterId: string;
    name: string;
    skill: string;
    difficulty: number;
    reason: string;
    stakes: string;
    total: number;
    outcome: Outcome;
  }[];
};

export type PartyMember = {
  characterId: string;
  name: string;
  pronouns: string;
  player: string;
  summary: string;
  vigor: number;
  vigorMax: number;
  charge: number;
  chargeMax: number;
};

const LIMITS = { narration: 2400, prompt: 240, whisper: 600, reason: 120, stakes: 160, note: 140, summary: 1600, option: 80 };

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Strip stray mechanics like "(Mixed, 9 vs 12)" from prose. */
export function stripMechanics(text: string): string {
  return text
    .replace(/\s*\((?:surge|success|mixed|miss|glitch)!?,?\s*\d+\s*vs\.?\s*\d+\)/gi, "")
    .replace(/\s*\(\s*\d+\s*vs\.?\s*\d+\s*\)/gi, "")
    .trim();
}

/** Clamp and validate a beat from any source. Never trust the model blindly. */
export function sanitizeBeat(raw: unknown, characterIds: string[]): GmBeat {
  const r = (raw ?? {}) as Record<string, unknown>;
  const valid = new Set(characterIds);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const checks: GmCheck[] = [];
  const seen = new Set<string>();
  for (const c of arr(r.checks) as Record<string, unknown>[]) {
    const characterId = str(c?.characterId, 64);
    const skill = str(c?.skill, 20).toLowerCase() as SkillKey;
    if (!valid.has(characterId) || !findSkill(skill)) continue;
    if (seen.has(characterId)) continue; // one check per character per beat
    seen.add(characterId);
    const edge = c?.edge === "boost" || c?.edge === "snag" ? c.edge : "none";
    checks.push({
      characterId,
      skill,
      difficulty: nearestDifficulty(Number(c?.difficulty) || 12),
      edge,
      reason: str(c?.reason, LIMITS.reason) || "Make a check.",
      stakes: str(c?.stakes, LIMITS.stakes) || "If it goes wrong, things get worse.",
    });
  }

  const whispers = (arr(r.whispers) as Record<string, unknown>[])
    .map((w) => ({ characterId: str(w?.characterId, 64), text: str(w?.text, LIMITS.whisper) }))
    .filter((w) => valid.has(w.characterId) && w.text);

  const effects = (arr(r.effects) as Record<string, unknown>[])
    .map((e) => ({
      characterId: str(e?.characterId, 64),
      vigor: clamp(Math.round(Number(e?.vigor) || 0), -10, 10),
      charge: clamp(Math.round(Number(e?.charge) || 0), -3, 3),
      note: str(e?.note, LIMITS.note),
    }))
    .filter((e) => valid.has(e.characterId) && (e.vigor !== 0 || e.charge !== 0));

  const options: MoveOption[] = (arr(r.options) as Record<string, unknown>[])
    .map((o) => {
      const skill = str(o?.skill, 20).toLowerCase();
      return {
        text: str(o?.text, LIMITS.option),
        skill: findSkill(skill) ? skill : "notice",
        ...(typeof o?.risky === "boolean" ? { risky: o.risky } : {}),
        ...(str(o?.stakes, LIMITS.stakes) ? { stakes: str(o?.stakes, LIMITS.stakes) } : {}),
        ...(str(o?.done, LIMITS.reason) ? { done: str(o?.done, LIMITS.reason) } : {}),
      };
    })
    .filter((o) => o.text)
    .slice(0, 3);

  const mode: Mode = r.mode === "combat" || r.mode === "social" ? r.mode : "explore";
  const narration = stripMechanics(str(r.narration, LIMITS.narration));
  return {
    narration: narration || (checks.length ? "" : "The city holds its breath."),
    checks,
    whispers,
    effects,
    mode,
    // Don't end a scene while dice are still owed.
    scene: r.scene === "advance" && checks.length === 0 ? "advance" : "stay",
    prompt: str(r.prompt, LIMITS.prompt) || "What do you do?",
    options,
    summary: str(r.summary, LIMITS.summary),
  };
}

// ---------------------------------------------------------------------------
// Backup narrator: deterministic, offline, good enough to keep a session going.

const SKILL_HINTS: [SkillKey, RegExp][] = [
  ["hack", /\b(hack|code|decrypt|jack|lock|terminal|system|override|spoof)/i],
  ["endure", /\b(swim|dive in\b|jump in|climb|endure|hold on|resist|brace)/i],
  ["interface", /\b(dive into|deep|commune|beacon|drone|woken|channel|signal|listen in)/i],
  ["shoot", /\b(shoot|fire|gun|pistol|rifle|aim|snipe|throw)/i],
  ["brawl", /\b(punch|hit|fight|attack|tackle|grab|smash|maul|kick|strike|wrestle)/i],
  ["sneak", /\b(sneak|hide|creep|slip|steal|pickpocket|quiet|unseen)/i],
  ["pilot", /\b(pilot|steer|boat|skiff|drive|fly|row)/i],
  ["patch", /\b(heal|patch|treat|bandage|repair|fix|stitch|medic)/i],
  ["talk", /\b(talk|convince|persuade|lie|bluff|negotiate|ask|tell|charm|bribe|shout|calm)/i],
  ["read", /\b(read|sense|empath|motive|study (his|her|their) face|trust)/i],
  ["notice", /\b(look|search|scan|spot|notice|examine|inspect|investigate|track|watch)/i],
  ["know", /\b(remember|recall|know|history|research|identify)/i],
];

export function guessSkill(text: string): SkillKey {
  for (const [skill, pattern] of SKILL_HINTS) if (pattern.test(text)) return skill;
  return "notice";
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** "Kestrel tries to dive in…" for suggested moves; "Kestrel goes for it" for first-person free text. */
function attempt(name: string, reason: string): string {
  return /^i\b/i.test(reason.trim()) ? `${name} goes for it` : `${name} tries to ${lower(reason)}`;
}

function lower(text: string): string {
  const t = text.trim().replace(/[.!]+$/, "");
  return t.charAt(0).toLowerCase() + t.slice(1);
}

const OUTCOME_LINES: Record<Outcome, string[]> = {
  surge: ["and it goes better than anyone hoped", "and spots an opening no one else saw"],
  success: ["and pulls it off", "and gets it done"],
  mixed: ["and manages it, but something slips", "and gets there, at a cost"],
  miss: ["but it doesn't work", "and comes up short"],
  glitch: ["and it goes badly, spectacularly wrong", "and triggers exactly the wrong thing"],
};

export const BEATS_PER_SCENE_BACKUP = 3;

/** Does this action need dice? Help and hold never do; safe suggested moves don't either. */
export function needsRoll(a: GmAction): boolean {
  if (a.kind === "help" || a.kind === "hold") return false;
  if (a.kind === "option") return a.risky !== false;
  return true;
}

export function backupBeat(ctx: GmContext): GmBeat {
  const scene = ctx.adventure.scenes[ctx.sceneIndex];
  const base: GmBeat = {
    narration: "",
    checks: [],
    whispers: [],
    effects: [],
    mode: ctx.mode,
    scene: "stay",
    prompt: "What do you do?",
    options: scene.options,
    summary: ctx.summary,
  };
  const advanceNow = ctx.sceneBeats + 1 >= BEATS_PER_SCENE_BACKUP;
  const close = (lines: string[], summaryBit: string): GmBeat => {
    const complication = pick(scene.complications, ctx.beat);
    return {
      ...base,
      narration: advanceNow ? [...lines, scene.exit].join("\n") : [...lines, `Then: ${complication}`].join("\n"),
      scene: advanceNow ? "advance" : "stay",
      summary: [ctx.summary, summaryBit, advanceNow ? scene.exit : ""].filter(Boolean).join("\n").slice(-1600),
    };
  };

  if (ctx.phase === "actions" && ctx.actions.length > 0) {
    const helped = new Set(ctx.actions.filter((a) => a.kind === "help" && a.targetId).map((a) => a.targetId as string));
    const rollers = ctx.actions.filter(needsRoll);
    const safeLines = ctx.actions
      .filter((a) => a.kind === "option" && !needsRoll(a))
      .map((a) => `${a.name} ${a.done ?? `does it: ${lower(a.text)}`}.`);
    if (rollers.length === 0) return close(safeLines, safeLines.join(" ") || "The crew regroups.");

    return {
      ...base,
      narration: safeLines.join("\n"),
      checks: rollers.map((a) => ({
        characterId: a.characterId,
        skill: ((a.skill && findSkill(a.skill) ? a.skill : guessSkill(a.text)) as SkillKey),
        difficulty: 12,
        edge: helped.has(a.characterId) ? ("boost" as const) : ("none" as const),
        reason: a.text.slice(0, 100),
        stakes: a.stakes ?? "If it goes wrong, things get worse.",
      })),
      prompt: "Roll on your phones.",
    };
  }

  if (ctx.phase === "outcome" && ctx.rolls.length > 0) {
    const lines = ctx.rolls.map((r, i) => `${attempt(r.name, r.reason)}, ${pick(OUTCOME_LINES[r.outcome], ctx.beat + i)}.`);
    const harm: Partial<Record<Outcome, number>> = { mixed: -1, miss: -2, glitch: -3 };
    const effects = ctx.rolls
      .filter((r) => harm[r.outcome])
      .map((r) => ({
        characterId: r.characterId,
        vigor: harm[r.outcome] as number,
        charge: 0,
        note: r.outcome === "mixed" ? "It cost you" : r.stakes.replace(/\.$/, ""),
      }));
    const misses = ctx.rolls.filter((r) => r.outcome === "miss" || r.outcome === "glitch").map((r) => r.stakes);
    const beat = close([...lines, ...misses], lines.join(" "));
    return { ...beat, effects };
  }

  // Nobody acted: nudge the scene forward with a complication.
  return {
    ...base,
    narration: `${pick(scene.complications, ctx.beat)} The crew needs to decide, now.`,
    prompt: scene.goal,
  };
}

export const SKILL_NAMES = Object.fromEntries(SKILLS.map((s) => [s.key, s.name])) as Record<string, string>;

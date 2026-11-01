// The Game Master contract: what a GM beat looks like, how we sanitize one,
// and the backup narrator that runs when the AI GM is unavailable.
import { findSkill, SKILLS, type SkillKey } from "./content.ts";
import { type Adventure } from "./adventures.ts";
import { clamp, nearestDifficulty, OUTCOME_LABEL, type Outcome } from "./rules.ts";

export type Mode = "explore" | "social" | "combat";

export type GmCheck = {
  characterId: string;
  skill: SkillKey;
  difficulty: number;
  edge: "boost" | "snag" | "none";
  reason: string;
};

export type GmBeat = {
  /** Read-aloud narration for the table screen. */
  narration: string;
  /** Checks the GM is calling for. Players roll these on their phones. */
  checks: GmCheck[];
  /** Private information for individual players. */
  whispers: { characterId: string; text: string }[];
  /** Vigor / Charge changes to apply (harm is negative vigor). */
  effects: { characterId: string; vigor: number; charge: number; note: string }[];
  mode: Mode;
  /** "advance" ends the current scene and starts the next. */
  scene: "stay" | "advance";
  /** The question the table sees next. */
  prompt: string;
  /** A short running summary of the story so far, for continuity. */
  summary: string;
};

export type Phase = "lobby" | "actions" | "rolls" | "outcome" | "ended";

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
  actions: { characterId: string; name: string; text: string }[];
  /** Results of the checks called last beat (phase "outcome"). */
  rolls: {
    characterId: string;
    name: string;
    skill: string;
    difficulty: number;
    reason: string;
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

const LIMITS = { narration: 2400, prompt: 240, whisper: 600, reason: 160, note: 160, summary: 1600 };

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

  const mode: Mode = r.mode === "combat" || r.mode === "social" ? r.mode : "explore";
  return {
    narration: str(r.narration, LIMITS.narration) || "The city holds its breath.",
    checks,
    whispers,
    effects,
    mode,
    // Don't end a scene while dice are still owed.
    scene: r.scene === "advance" && checks.length === 0 ? "advance" : "stay",
    prompt: str(r.prompt, LIMITS.prompt) || "What do you do?",
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

const OUTCOME_LINES: Record<Outcome, string[]> = {
  surge: [
    "pulls it off brilliantly — better than anyone hoped",
    "makes it look easy, and spots an extra opening",
  ],
  success: ["gets it done", "pulls it off"],
  mixed: ["manages it, but not cleanly — something slips", "gets there, at a cost"],
  miss: ["comes up short, and the situation tightens", "can't make it happen this time"],
  glitch: ["fumbles spectacularly, and things go sideways", "triggers exactly the wrong thing"],
};

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

export const BEATS_PER_SCENE_BACKUP = 3;

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
    summary: ctx.summary,
  };

  if (ctx.phase === "actions" && ctx.actions.length > 0) {
    const callouts = ctx.actions.map((a) => `${a.name}: ${SKILLS.find((s) => s.key === guessSkill(a.text))?.name ?? "Notice"}`);
    return {
      ...base,
      narration: `The crew commits — and for a heartbeat, all of ${scene.title} seems to hold its breath. Nothing about this is certain.\n\nRoll to see how it plays out. ${callouts.join(" · ")}.`,
      checks: ctx.actions.map((a) => {
        const skill = guessSkill(a.text);
        const name = SKILLS.find((s) => s.key === skill)?.name ?? skill;
        return { characterId: a.characterId, skill, difficulty: 12, edge: "none" as const, reason: `${name}: ${a.text.slice(0, 80)}` };
      }),
      prompt: "Roll your checks!",
    };
  }

  if (ctx.phase === "outcome" && ctx.rolls.length > 0) {
    const lines = ctx.rolls.map((r, i) => `${r.name} ${pick(OUTCOME_LINES[r.outcome], ctx.beat + i)} (${OUTCOME_LABEL[r.outcome]}, ${r.total} vs ${r.difficulty}).`);
    const effects = ctx.rolls
      .filter((r) => r.outcome === "miss" || r.outcome === "glitch")
      .map((r) => ({ characterId: r.characterId, vigor: r.outcome === "glitch" ? -3 : -2, charge: 0, note: "Took a hit in the chaos." }));
    const advance = ctx.sceneBeats + 1 >= BEATS_PER_SCENE_BACKUP;
    const complication = pick(scene.complications, ctx.beat);
    return {
      ...base,
      narration: advance
        ? `${lines.join("\n")}\n\n${scene.exit}`
        : `${lines.join("\n")}\n\nThen: ${complication}`,
      effects,
      scene: advance ? "advance" : "stay",
      summary: `${ctx.summary}\n${scene.title}: ${ctx.rolls.map((r) => `${r.name} ${OUTCOME_LABEL[r.outcome].toLowerCase()}`).join(", ")}.`.trim().slice(-1200),
    };
  }

  // Nobody acted: nudge the scene forward with a complication.
  return {
    ...base,
    narration: `${pick(scene.complications, ctx.beat)} The crew needs to decide — now.`,
    prompt: `${scene.goal} What do you do?`,
  };
}

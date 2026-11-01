// The Wake System, as code. See docs/rules.md.
import {
  BACKGROUNDS,
  CALLINGS,
  MAX_CHARGE,
  MAX_STAT,
  ORIGINS,
  SKILLS,
  STAT_ARRAY,
  type SkillKey,
  type StatKey,
  findBackground,
  findCalling,
  findOrigin,
  findSkill,
  CALLING_DEFAULTS,
} from "./content.ts";

export type Stats = Record<StatKey, number>;

export type CharacterDraft = {
  name: string;
  pronouns: string;
  look: string;
  drive: string;
  origin: string;
  variant: string;
  calling: string;
  background: string;
  /** The stat array assignment, before the origin bonus. */
  stats: Stats;
};

export type Sheet = {
  stats: Stats;
  skills: Record<SkillKey, number>;
  vigorMax: number;
  chargeMax: number;
  armor: number;
};

export const STAT_KEYS: StatKey[] = ["grit", "edge", "wits", "heart", "sync"];

export const DIFFICULTIES = [
  { value: 8, name: "Easy" },
  { value: 12, name: "Standard" },
  { value: 16, name: "Hard" },
  { value: 20, name: "Extreme" },
] as const;

export function difficultyName(value: number): string {
  return DIFFICULTIES.find((d) => d.value === value)?.name ?? `DC ${value}`;
}

export function nearestDifficulty(value: number): number {
  let best: number = DIFFICULTIES[1].value;
  for (const d of DIFFICULTIES) if (Math.abs(d.value - value) < Math.abs(best - value)) best = d.value;
  return best;
}

export function emptyStats(): Stats {
  return { grit: 0, edge: 0, wits: 0, heart: 0, sync: 0 };
}

/** True when the five values are exactly the standard array in some order. */
export function isValidArray(stats: Stats): boolean {
  const values = STAT_KEYS.map((k) => stats[k]).sort((a, b) => b - a);
  const expected = [...STAT_ARRAY].sort((a, b) => b - a);
  return values.every((v, i) => v === expected[i]);
}

export function validateDraft(draft: CharacterDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Give your character a name.");
  if (draft.name.trim().length > 40) errors.push("Names are 40 characters or fewer.");
  const origin = findOrigin(draft.origin);
  if (!origin) errors.push("Choose an origin.");
  if (origin?.variants && !origin.variants.some((v) => v.key === draft.variant)) errors.push(`Choose your ${origin.name} kind.`);
  if (!findCalling(draft.calling)) errors.push("Choose a calling.");
  if (!findBackground(draft.background)) errors.push("Choose a background.");
  if (!isValidArray(draft.stats)) errors.push("Assign +2, +1, +1, 0 and −1 to your five stats.");
  if (draft.look.length > 400 || draft.drive.length > 200 || draft.pronouns.length > 30) errors.push("Some details are too long.");
  return errors;
}

export function deriveSheet(input: {
  origin: string;
  calling: string;
  background: string;
  stats: Stats;
  level?: number;
  bonusVigor?: number;
}): Sheet {
  const origin = findOrigin(input.origin) ?? ORIGINS[0];
  const calling = findCalling(input.calling) ?? CALLINGS[0];
  const background = findBackground(input.background) ?? BACKGROUNDS[0];

  const stats: Stats = { ...emptyStats(), ...input.stats };
  stats[origin.statBonus] = Math.min(MAX_STAT, stats[origin.statBonus] + 1);

  const skills = Object.fromEntries(SKILLS.map((s) => [s.key, 0])) as Record<SkillKey, number>;
  const sources: SkillKey[] = [origin.skill, ...calling.skills, background.skill];
  for (const key of sources) skills[key] = skills[key] === 0 ? 2 : 4;

  const level = Math.max(1, input.level ?? 1);
  const vigorMax = Math.max(4, 8 + stats.grit * 2 + calling.vigorBonus + (level - 1) * 2 + (input.bonusVigor ?? 0));

  return { stats, skills, vigorMax, chargeMax: MAX_CHARGE, armor: calling.armor };
}

// ---------------------------------------------------------------------------
// Checks

export type Outcome = "surge" | "success" | "mixed" | "miss" | "glitch";
export type Edge = "boost" | "snag" | "none";

export type CheckResult = {
  dice: number[];
  kept: number;
  modifier: number;
  total: number;
  difficulty: number;
  outcome: Outcome;
};

export function outcomeFor(kept: number, total: number, difficulty: number): Outcome {
  if (kept === 20) return "surge";
  if (kept === 1) return "glitch";
  if (total >= difficulty + 5) return "surge";
  if (total >= difficulty) return "success";
  if (total >= difficulty - 4) return "mixed";
  return "miss";
}

export function d20(rng: () => number): number {
  return 1 + Math.floor(rng() * 20);
}

export function rollCheck(opts: {
  modifier: number;
  difficulty: number;
  edge?: Edge;
  rng?: () => number;
}): CheckResult {
  const rng = opts.rng ?? Math.random;
  const edge = opts.edge ?? "none";
  const dice = edge === "none" ? [d20(rng)] : [d20(rng), d20(rng)];
  const kept = edge === "boost" ? Math.max(...dice) : edge === "snag" ? Math.min(...dice) : dice[0];
  const total = kept + opts.modifier;
  return { dice, kept, modifier: opts.modifier, total, difficulty: opts.difficulty, outcome: outcomeFor(kept, total, opts.difficulty) };
}

export function checkModifier(sheet: Sheet, skill: SkillKey, stat?: StatKey): number {
  const s = findSkill(skill);
  const statKey = stat ?? s?.stat ?? "wits";
  return sheet.stats[statKey] + (sheet.skills[skill] ?? 0);
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  surge: "Surge!",
  success: "Success",
  mixed: "Mixed",
  miss: "Miss",
  glitch: "Glitch!",
};

export function formatModifier(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

// ---------------------------------------------------------------------------
// Table codes

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

export function makeTableCode(rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return out;
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** A full draft from a calling's defaults: the simplified creation path. */
export function draftFromChoices(input: {
  name: string;
  pronouns?: string;
  look?: string;
  drive?: string;
  origin: string;
  variant?: string;
  calling: string;
}): CharacterDraft {
  const defaults = CALLING_DEFAULTS[input.calling] ?? CALLING_DEFAULTS.breaker;
  return {
    name: input.name,
    pronouns: input.pronouns ?? "",
    look: input.look ?? "",
    drive: input.drive ?? "",
    origin: input.origin,
    variant: input.variant ?? "",
    calling: input.calling,
    background: defaults.background,
    stats: { ...defaults.stats },
  };
}

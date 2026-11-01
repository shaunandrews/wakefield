import {
  boolean,
  capsule,
  endpoint,
  id,
  json,
  mutation,
  number,
  query,
  string,
  table,
  userId,
} from "@spacefast/zero/server";

import { findAdventure, ADVENTURES, type Adventure } from "../shared/adventures.ts";
import { abilitiesFor, findCalling, findOrigin, findSkill, type SkillKey } from "../shared/content.ts";
import { backupBeat, sanitizeBeat, type GmAction, type GmBeat, type GmContext, type Mode, type MoveOption, type Phase } from "../shared/gm.ts";
import {
  checkModifier,
  clamp,
  deriveSheet,
  emptyStats,
  formatModifier,
  makeTableCode,
  normalizeCode,
  OUTCOME_LABEL,
  rollCheck,
  validateDraft,
  difficultyName,
  type CharacterDraft,
  type CheckResult,
  type Stats,
} from "../shared/rules.ts";
import type {
  CampaignSummary,
  CampaignView,
  CharacterRow,
  CharacterView,
  CheckView,
  LogView,
  MeView,
  PlayerView,
  SeatView,
  TableView,
} from "../shared/views.ts";
import { callClaude, describeAbilities, GmError, statLine } from "./gm.ts";

// ---------------------------------------------------------------------------
// Row types. The SDK's generic rows are loosely typed, so we name ours here.

type Meta = { id: string; createdAt: string; updatedAt: string };
type Profile = Meta & { userId: string; handle: string };
type Campaign = Meta & {
  code: string;
  name: string;
  hostId: string;
  adventure: string;
  sceneIndex: number;
  sceneBeats: number;
  phase: string;
  beat: number;
  mode: string;
  prompt: string;
  summary: string;
  logSeq: number;
  gmBusy: boolean;
  gmBusyAt: string;
  gmNotice: string;
  optionsJson: string;
  phaseAt: string;
};
type Seat = Meta & { campaignId: string; userId: string; characterId: string; active: boolean };
type LogRow = Meta & {
  campaignId: string;
  seq: number;
  kind: string;
  text: string;
  who: string;
  characterId: string;
  audience: string;
  dataJson: string;
  beat: number;
};
type ActionRow = Meta & {
  campaignId: string;
  beat: number;
  characterId: string;
  userId: string;
  text: string;
  kind: string;
  targetId: string;
  ability: string;
  skill: string;
  risky: boolean;
  stakes: string;
  done: string;
};
type CheckRow = Meta & {
  campaignId: string;
  beat: number;
  characterId: string;
  userId: string;
  skill: string;
  difficulty: number;
  edge: string;
  reason: string;
  stakes: string;
  rolled: boolean;
  resultJson: string;
};

// The handlers below share helpers, so we use a deliberately loose db type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Auth = { userId: string | null; displayName: string; isGuest: boolean; isAuthenticated: boolean };

const GM_LOCK_MS = 45_000;
/**
 * Every live query in the app. Mutations broadcast these so other devices
 * (the table, the other phones) refresh — without an explicit invalidate,
 * only the device that made the change re-runs its queries.
 */
const LIVE_QUERIES = ["me", "myCharacters", "character", "myCampaigns", "tableView", "playerView"];
const LOG_WINDOW = 80;

// ---------------------------------------------------------------------------
// Helpers

function requireUser(auth: Auth): string {
  if (!auth.userId) throw new Error("Open Wakefield in a browser to get started.");
  return auth.userId;
}

function parseStats(json: string): Stats {
  try {
    return { ...emptyStats(), ...(JSON.parse(json) as Partial<Stats>) };
  } catch {
    return emptyStats();
  }
}

function toCharacterView(row: CharacterRow, viewerId: string | null): CharacterView {
  const baseStats = parseStats(row.statsJson);
  const sheet = deriveSheet({ origin: row.origin, calling: row.calling, background: row.background, stats: baseStats, level: row.level });
  return {
    id: row.id,
    name: row.name,
    pronouns: row.pronouns,
    look: row.look,
    drive: row.drive,
    origin: row.origin,
    variant: row.variant,
    calling: row.calling,
    background: row.background,
    baseStats,
    sheet,
    vigor: row.vigor,
    charge: row.charge,
    xp: row.xp,
    level: row.level,
    scars: row.scars,
    notes: row.notes,
    isMine: row.ownerId === viewerId,
  };
}

async function campaignByCode(db: Db, code: string): Promise<Campaign> {
  const clean = normalizeCode(code);
  const campaign = (await db.campaigns.withIndex("by_code", (r: Db) => r.eq("code", clean)).first()) as Campaign | null;
  if (!campaign) throw new Error(`No table with code ${clean || code}.`);
  return campaign;
}

async function activeSeats(db: Db, campaignId: string): Promise<Seat[]> {
  const seats = (await db.seats.withIndex("by_campaign", (r: Db) => r.eq("campaignId", campaignId)).collect()) as Seat[];
  return seats.filter((s) => s.active);
}

async function handleFor(db: Db, uid: string): Promise<string> {
  const profile = (await db.profiles.withIndex("by_user", (r: Db) => r.eq("userId", uid)).first()) as Profile | null;
  return profile?.handle ?? "";
}

function adventureOf(campaign: Campaign): Adventure {
  return findAdventure(campaign.adventure) ?? ADVENTURES[0];
}

function toCampaignView(c: Campaign, viewerId: string | null): CampaignView {
  const adventure = adventureOf(c);
  const scene = adventure.scenes[Math.min(c.sceneIndex, adventure.scenes.length - 1)];
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    phase: c.phase as Phase,
    beat: c.beat,
    mode: c.mode as Mode,
    prompt: c.prompt,
    adventureTitle: adventure.title,
    sceneTitle: scene.title,
    sceneIndex: c.sceneIndex,
    sceneCount: adventure.scenes.length,
    gmBusy: c.gmBusy && Date.now() - Date.parse(c.gmBusyAt || "0") < GM_LOCK_MS,
    gmNotice: c.hostId === viewerId ? c.gmNotice : "",
    isHost: c.hostId === viewerId,
    phaseAt: c.phaseAt || c.updatedAt,
    summary: c.summary,
    adventurePitch: adventure.pitch,
  };
}

function parseResult(json: string): (CheckResult & { skill: string; edge: string }) | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseOptions(json: string): MoveOption[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? (value as MoveOption[]) : [];
  } catch {
    return [];
  }
}

function toCheckView(c: CheckRow): CheckView {
  return {
    id: c.id,
    characterId: c.characterId,
    skill: c.skill,
    difficulty: c.difficulty,
    edge: c.edge,
    reason: c.reason,
    stakes: c.stakes,
    rolled: c.rolled,
    result: parseResult(c.resultJson),
  };
}

function toLogView(row: LogRow): LogView {
  return {
    id: row.id,
    seq: row.seq,
    kind: row.kind as LogView["kind"],
    text: row.text,
    who: row.who,
    characterId: row.characterId,
    private: row.audience !== "all",
    roll: row.kind === "roll" ? parseResult(row.dataJson) ?? undefined : undefined,
  };
}

async function readLog(db: Db, campaignId: string, viewerId: string | null, includeWhispers: boolean): Promise<LogView[]> {
  const rows = (await db.log
    .withIndex("by_campaign_seq", (r: Db) => r.eq("campaignId", campaignId))
    .order("desc")
    .take(LOG_WINDOW)) as LogRow[];
  return rows
    .filter((row) => row.audience === "all" || (includeWhispers && row.audience === viewerId))
    .sort((a, b) => a.seq - b.seq)
    .map(toLogView);
}

type NewLog = { kind: LogView["kind"]; text: string; who?: string; characterId?: string; audience?: string; data?: unknown };

async function appendLog(db: Db, campaign: Campaign, entries: NewLog[]): Promise<number> {
  let seq = campaign.logSeq;
  for (const e of entries) {
    seq += 1;
    await db.log.insert({
      campaignId: campaign.id,
      seq,
      kind: e.kind,
      text: e.text,
      who: e.who ?? "",
      characterId: e.characterId ?? "",
      audience: e.audience ?? "all",
      dataJson: e.data === undefined ? "" : JSON.stringify(e.data),
      beat: campaign.beat,
    });
  }
  return seq;
}

async function checksFor(db: Db, campaignId: string, beat: number): Promise<CheckRow[]> {
  return (await db.checks.withIndex("by_campaign_beat", (r: Db) => r.eq("campaignId", campaignId).eq("beat", beat)).collect()) as CheckRow[];
}

async function actionsFor(db: Db, campaignId: string, beat: number): Promise<ActionRow[]> {
  return (await db.actions.withIndex("by_campaign_beat", (r: Db) => r.eq("campaignId", campaignId).eq("beat", beat)).collect()) as ActionRow[];
}

async function seatViews(db: Db, campaign: Campaign, viewerId: string | null): Promise<SeatView[]> {
  const seats = await activeSeats(db, campaign.id);
  const actions = campaign.phase === "actions" ? await actionsFor(db, campaign.id, campaign.beat) : [];
  const checks = campaign.phase === "rolls" || campaign.phase === "outcome" ? await checksFor(db, campaign.id, campaign.beat) : [];
  const views: SeatView[] = [];
  for (const seat of seats) {
    const row = (await db.characters.get(seat.characterId)) as CharacterRow | null;
    if (!row) continue;
    const check = checks.find((c) => c.characterId === row.id);
    views.push({
      seatId: seat.id,
      userId: seat.userId,
      handle: await handleFor(db, seat.userId),
      ready: actions.some((a) => a.characterId === row.id),
      character: toCharacterView(row, viewerId),
      check: check ? toCheckView(check) : null,
    });
  }
  return views;
}

/** Gather everything the GM needs for the next beat. Read-only. */
async function gmContext(db: Db, campaign: Campaign): Promise<GmContext> {
  const adventure = adventureOf(campaign);
  const seats = await activeSeats(db, campaign.id);
  const party: GmContext["party"] = [];
  const names = new Map<string, string>();
  for (const seat of seats) {
    const row = (await db.characters.get(seat.characterId)) as CharacterRow | null;
    if (!row) continue;
    const view = toCharacterView(row, null);
    names.set(row.id, row.name);
    const origin = findOrigin(row.origin);
    const variant = origin?.variants?.find((v) => v.key === row.variant);
    const calling = findCalling(row.calling);
    party.push({
      characterId: row.id,
      name: row.name,
      pronouns: row.pronouns,
      player: await handleFor(db, seat.userId),
      summary: [
        `${variant ? `${variant.name} ` : ""}${origin?.name ?? row.origin} ${calling?.name ?? row.calling}.`,
        row.look ? `Look: ${row.look}.` : "",
        row.drive ? `Drive: ${row.drive}` : "",
        statLine(view.sheet.stats, view.sheet.skills),
        `Abilities: ${describeAbilities(row.origin, row.calling)}${variant ? ` | ${variant.text}` : ""}.`,
        row.scars ? `Scars: ${row.scars}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      vigor: row.vigor,
      vigorMax: view.sheet.vigorMax,
      charge: row.charge,
      chargeMax: view.sheet.chargeMax,
    });
  }

  const recent = (await readLog(db, campaign.id, null, false))
    .filter((e) => e.kind !== "scene")
    .slice(-14)
    .map((e) => ({ kind: e.kind, text: e.text.slice(0, 600), who: e.who || undefined }));

  const actions =
    campaign.phase === "actions"
      ? (await actionsFor(db, campaign.id, campaign.beat)).map((a) => ({
          characterId: a.characterId,
          name: names.get(a.characterId) ?? "Someone",
          text: a.text,
          kind: (["option", "help", "hold"].includes(a.kind) ? a.kind : "free") as GmAction["kind"],
          ...(a.targetId ? { targetId: a.targetId } : {}),
          ...(a.ability ? { ability: a.ability } : {}),
          ...(a.skill ? { skill: a.skill } : {}),
          risky: a.risky,
          ...(a.stakes ? { stakes: a.stakes } : {}),
          ...(a.done ? { done: a.done } : {}),
        }))
      : [];

  const rolls =
    campaign.phase === "outcome"
      ? (await checksFor(db, campaign.id, campaign.beat))
          .filter((c) => c.rolled)
          .map((c) => {
            const result = parseResult(c.resultJson);
            return {
              characterId: c.characterId,
              name: names.get(c.characterId) ?? "Someone",
              skill: findSkill(c.skill)?.name ?? c.skill,
              difficulty: c.difficulty,
              reason: c.reason,
              stakes: c.stakes || "If it goes wrong, things get worse.",
              total: result?.total ?? 0,
              outcome: result?.outcome ?? "miss",
            };
          })
      : [];

  return {
    phase: campaign.phase as Phase,
    beat: campaign.beat,
    sceneBeats: campaign.sceneBeats,
    mode: campaign.mode as Mode,
    summary: campaign.summary,
    adventure,
    sceneIndex: campaign.sceneIndex,
    party,
    recentLog: recent,
    actions,
    rolls,
  };
}

/** Apply a sanitized beat to the campaign. Runs inside a mutation. */
async function applyBeat(db: Db, campaign: Campaign, beat: GmBeat, notice: string): Promise<void> {
  const seats = await activeSeats(db, campaign.id);
  const characters = new Map<string, CharacterRow>();
  for (const seat of seats) {
    const row = (await db.characters.get(seat.characterId)) as CharacterRow | null;
    if (row) characters.set(row.id, row);
  }
  const seatFor = (characterId: string) => seats.find((s) => s.characterId === characterId);
  const entries: NewLog[] = [];

  if (campaign.phase === "actions") {
    for (const a of await actionsFor(db, campaign.id, campaign.beat)) {
      const c = characters.get(a.characterId);
      if (!c) continue;
      entries.push({ kind: "action", text: a.text, who: c.name, characterId: c.id });
      // Abilities spend their own Charge.
      const ability = a.ability ? abilitiesFor(c.origin, c.calling).find((x) => x.name === a.ability) : undefined;
      if (ability && ability.cost > 0 && c.charge >= ability.cost) {
        c.charge -= ability.cost;
        await db.characters.update(c.id, { charge: c.charge });
      }
    }
  }

  if (beat.narration) entries.push({ kind: "narration", text: beat.narration, who: "GM" });

  for (const w of beat.whispers) {
    const seat = seatFor(w.characterId);
    if (seat) entries.push({ kind: "whisper", text: w.text, who: "GM", characterId: w.characterId, audience: seat.userId });
  }

  for (const e of beat.effects) {
    const row = characters.get(e.characterId);
    if (!row) continue;
    const sheet = toCharacterView(row, null).sheet;
    const vigor = clamp(row.vigor + e.vigor, 0, sheet.vigorMax);
    const charge = clamp(row.charge + e.charge, 0, sheet.chargeMax);
    await db.characters.update(row.id, { vigor, charge });
    row.vigor = vigor;
    row.charge = charge;
    const parts: string[] = [];
    if (e.vigor) parts.push(`${e.vigor > 0 ? "+" : ""}${e.vigor} Vigor (${vigor}/${sheet.vigorMax})`);
    if (e.charge) parts.push(`${e.charge > 0 ? "+" : ""}${e.charge} Charge (${charge}/${sheet.chargeMax})`);
    entries.push({
      kind: "effect",
      text: `${e.note ? `${e.note}. ` : ""}${parts.join(", ")}${vigor === 0 ? " Down!" : ""}`,
      who: row.name,
      characterId: row.id,
    });
  }

  const nextBeat = campaign.beat + 1;
  for (const check of beat.checks) {
    const seat = seatFor(check.characterId);
    if (!seat) continue;
    await db.checks.insert({
      campaignId: campaign.id,
      beat: nextBeat,
      characterId: check.characterId,
      userId: seat.userId,
      skill: check.skill,
      difficulty: check.difficulty,
      edge: check.edge,
      reason: check.reason,
      stakes: check.stakes,
      rolled: false,
      resultJson: "",
    });
  }

  let phase: Phase = beat.checks.length > 0 ? "rolls" : "actions";
  let sceneIndex = campaign.sceneIndex;
  // Count only beats that resolve (not the ones that just call for dice).
  let sceneBeats = campaign.sceneBeats + (beat.checks.length ? 0 : 1);
  let prompt = beat.prompt;
  let mode: Mode = beat.mode;
  const adventure = adventureOf(campaign);
  let options = beat.options.length ? beat.options : adventure.scenes[sceneIndex]?.options ?? [];

  if (beat.scene === "advance") {
    const finished = sceneIndex + 1 >= adventure.scenes.length;
    const xp = finished ? 4 : 1;
    for (const row of characters.values()) {
      const sheet = toCharacterView(row, null).sheet;
      await db.characters.update(row.id, { xp: row.xp + xp, charge: clamp(row.charge + 1, 0, sheet.chargeMax) });
    }
    if (finished) {
      phase = "ended";
      prompt = "The adventure is complete.";
      options = [];
    } else {
      sceneIndex += 1;
      sceneBeats = 0;
      mode = "explore";
      const next = adventure.scenes[sceneIndex];
      options = next.options;
      entries.push({ kind: "scene", text: next.title });
      entries.push({ kind: "narration", text: next.opening, who: "GM" });
      prompt = "What do you do?";
    }
  }

  const logSeq = await appendLog(db, campaign, entries);
  await db.campaigns.update(campaign.id, {
    beat: nextBeat,
    phase,
    mode,
    prompt,
    sceneIndex,
    sceneBeats,
    summary: beat.summary || campaign.summary,
    logSeq,
    gmBusy: false,
    gmNotice: notice,
    optionsJson: JSON.stringify(options),
    phaseAt: new Date().toISOString(),
  });
}

function requireHost(campaign: Campaign, uid: string) {
  if (campaign.hostId !== uid) throw new Error("Only the table that started this campaign can do that.");
}

function signingData(campaignId: string, beat: number, payload: string): string {
  return `${campaignId}|${beat}|${payload}`;
}

// ---------------------------------------------------------------------------

export default capsule({
  name: "Wakefield",
  schema: {
    profiles: table({ userId: userId(), handle: string() }).index("by_user", ["userId"]),
    characters: table({
      ownerId: userId(),
      name: string(),
      pronouns: string().default(""),
      look: string().default(""),
      drive: string().default(""),
      origin: string(),
      variant: string().default(""),
      calling: string(),
      background: string(),
      statsJson: string(),
      vigor: number(),
      charge: number(),
      xp: number().default(0),
      level: number().default(1),
      scars: string().default(""),
      notes: string().default(""),
      archived: boolean().default(false),
    }).index("by_owner", ["ownerId"]),
    campaigns: table({
      code: string(),
      name: string(),
      hostId: userId(),
      adventure: string(),
      sceneIndex: number().default(0),
      sceneBeats: number().default(0),
      phase: string().default("lobby"),
      beat: number().default(0),
      mode: string().default("explore"),
      prompt: string().default(""),
      summary: string().default(""),
      logSeq: number().default(0),
      gmBusy: boolean().default(false),
      gmBusyAt: string().default(""),
      gmNotice: string().default(""),
      optionsJson: string().default(""),
      phaseAt: string().default(""),
    })
      .index("by_code", ["code"])
      .index("by_host", ["hostId"]),
    seats: table({
      campaignId: id("campaigns"),
      userId: userId(),
      characterId: id("characters"),
      active: boolean().default(true),
    })
      .index("by_campaign", ["campaignId"])
      .index("by_user", ["userId"]),
    log: table({
      campaignId: id("campaigns"),
      seq: number(),
      kind: string(),
      text: string(),
      who: string().default(""),
      characterId: string().default(""),
      audience: string().default("all"),
      dataJson: string().default(""),
      beat: number().default(0),
    }).index("by_campaign_seq", ["campaignId", "seq"]),
    actions: table({
      campaignId: id("campaigns"),
      beat: number(),
      characterId: id("characters"),
      userId: userId(),
      text: string(),
      kind: string().default("free"),
      targetId: string().default(""),
      ability: string().default(""),
      skill: string().default(""),
      risky: boolean().default(true),
      stakes: string().default(""),
      done: string().default(""),
    }).index("by_campaign_beat", ["campaignId", "beat"]),
    checks: table({
      campaignId: id("campaigns"),
      beat: number(),
      characterId: id("characters"),
      userId: userId(),
      skill: string(),
      difficulty: number(),
      edge: string().default("none"),
      reason: string().default(""),
      stakes: string().default(""),
      rolled: boolean().default(false),
      resultJson: string().default(""),
    }).index("by_campaign_beat", ["campaignId", "beat"]),
  },

  queries: {
    me: query(async (ctx): Promise<MeView | null> => {
      const auth = ctx.auth as Auth;
      if (!auth.userId) return null;
      const profile = (await ctx.db.profiles.withIndex("by_user", (r) => r.eq("userId", auth.userId)).first()) as Profile | null;
      return {
        userId: auth.userId,
        isGuest: auth.isGuest,
        handle: profile?.handle ?? (auth.isGuest ? "" : auth.displayName),
        hasHandle: Boolean(profile),
      };
    }),

    myCharacters: query(async (ctx): Promise<CharacterView[]> => {
      const uid = (ctx.auth as Auth).userId;
      if (!uid) return [];
      const rows = (await ctx.db.characters.withIndex("by_owner", (r) => r.eq("ownerId", uid)).collect()) as CharacterRow[];
      return rows.filter((r) => !r.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => toCharacterView(r, uid));
    }),

    character: query(async (ctx, characterId: string): Promise<CharacterView | null> => {
      const row = (await ctx.db.characters.get(characterId)) as CharacterRow | null;
      if (!row || row.archived) return null;
      return toCharacterView(row, (ctx.auth as Auth).userId);
    }),

    myCampaigns: query(async (ctx): Promise<CampaignSummary[]> => {
      const uid = (ctx.auth as Auth).userId;
      if (!uid) return [];
      const out = new Map<string, CampaignSummary>();
      const hosted = (await ctx.db.campaigns.withIndex("by_host", (r) => r.eq("hostId", uid)).collect()) as Campaign[];
      for (const c of hosted) {
        out.set(c.id, { code: c.code, name: c.name, phase: c.phase as Phase, adventureTitle: adventureOf(c).title, role: "host", updatedAt: c.updatedAt });
      }
      const seats = (await ctx.db.seats.withIndex("by_user", (r) => r.eq("userId", uid)).collect()) as Seat[];
      for (const s of seats) {
        if (!s.active || out.has(s.campaignId)) continue;
        const c = (await ctx.db.campaigns.get(s.campaignId)) as Campaign | null;
        if (c) out.set(c.id, { code: c.code, name: c.name, phase: c.phase as Phase, adventureTitle: adventureOf(c).title, role: "player", updatedAt: c.updatedAt });
      }
      return [...out.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
    }),

    tableView: query(async (ctx, code: string): Promise<TableView | null> => {
      const uid = (ctx.auth as Auth).userId;
      const clean = normalizeCode(code);
      const campaign = (await ctx.db.campaigns.withIndex("by_code", (r) => r.eq("code", clean)).first()) as Campaign | null;
      if (!campaign) return null;
      return {
        campaign: toCampaignView(campaign, uid),
        seats: await seatViews(ctx.db, campaign, uid),
        // The table is a shared screen: whispers never show here.
        log: await readLog(ctx.db, campaign.id, uid, false),
      };
    }),

    playerView: query(async (ctx, code: string): Promise<PlayerView | null> => {
      const uid = (ctx.auth as Auth).userId;
      const clean = normalizeCode(code);
      const campaign = (await ctx.db.campaigns.withIndex("by_code", (r) => r.eq("code", clean)).first()) as Campaign | null;
      if (!campaign) return null;
      const seats = await seatViews(ctx.db, campaign, uid);
      const seat = seats.find((s) => s.userId === uid) ?? null;
      let myAction = "";
      let myActionAbility = "";
      if (seat && campaign.phase === "actions") {
        const mine = (await actionsFor(ctx.db, campaign.id, campaign.beat)).find((a) => a.characterId === seat.character.id);
        myAction = mine?.text ?? "";
        myActionAbility = mine?.ability ?? "";
      }
      const rows = ((await ctx.db.log
        .withIndex("by_campaign_seq", (r) => r.eq("campaignId", campaign.id))
        .order("desc")
        .take(LOG_WINDOW)) as LogRow[]).sort((x, y) => x.seq - y.seq);
      const visible = rows.filter((r) => r.audience === "all" || r.audience === uid);
      const lastBeat = rows.length ? rows[rows.length - 1].beat : 0;
      const latestNarration = [...visible].reverse().find((r) => r.kind === "narration");
      const paragraphs = (latestNarration?.text ?? "").split(/\n+/).filter(Boolean);
      // The last two sentences are enough context on a phone.
      const lastParagraph = paragraphs[paragraphs.length - 1] ?? "";
      const sentences = lastParagraph.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [lastParagraph];
      const latestStory = sentences.slice(-2).join("").trim();
      const myEffects = seat
        ? visible.filter((r) => r.kind === "effect" && r.characterId === seat.character.id && r.beat === lastBeat).map((r) => r.text)
        : [];
      const whisperRow = [...visible].reverse().find((r) => r.kind === "whisper" && r.audience === uid);
      return {
        campaign: toCampaignView(campaign, uid),
        seat,
        party: seats.map((s) => ({
          characterId: s.character.id,
          name: s.character.name,
          vigor: s.character.vigor,
          vigorMax: s.character.sheet.vigorMax,
          ready: s.ready,
          isMe: s.userId === uid,
        })),
        myAction,
        myActionAbility,
        options: parseOptions(campaign.optionsJson),
        latestStory,
        myEffects,
        whisper: whisperRow && whisperRow.beat >= lastBeat - 1 ? whisperRow.text : "",
        log: visible.map(toLogView),
      };
    }),
  },

  mutations: {
    setHandle: mutation(async (ctx, handle: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const clean = handle.trim().slice(0, 24);
      if (!clean) throw new Error("Pick a name for yourself.");
      const existing = (await ctx.db.profiles.withIndex("by_user", (r) => r.eq("userId", uid)).first()) as Profile | null;
      if (existing) await ctx.db.profiles.update(existing.id, { handle: clean });
      else await ctx.db.profiles.insert({ userId: uid, handle: clean });
      return clean;
    }),

    createCharacter: mutation(async (ctx, draft: CharacterDraft) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const clean: CharacterDraft = {
        name: String(draft?.name ?? "").trim(),
        pronouns: String(draft?.pronouns ?? "").trim(),
        look: String(draft?.look ?? "").trim(),
        drive: String(draft?.drive ?? "").trim(),
        origin: String(draft?.origin ?? ""),
        variant: String(draft?.variant ?? ""),
        calling: String(draft?.calling ?? ""),
        background: String(draft?.background ?? ""),
        stats: { ...emptyStats(), ...(draft?.stats ?? {}) },
      };
      const errors = validateDraft(clean);
      if (errors.length) throw new Error(errors.join(" "));
      const sheet = deriveSheet(clean);
      const row = await ctx.db.characters.insert({
        ownerId: uid,
        name: clean.name,
        pronouns: clean.pronouns,
        look: clean.look,
        drive: clean.drive,
        origin: clean.origin,
        variant: clean.variant,
        calling: clean.calling,
        background: clean.background,
        statsJson: JSON.stringify(clean.stats),
        vigor: sheet.vigorMax,
        charge: sheet.chargeMax,
      });
      return row.id as string;
    }),

    updateCharacter: mutation(async (ctx, characterId: string, patch: { look?: string; drive?: string; notes?: string; pronouns?: string }) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const row = (await ctx.db.characters.get(characterId)) as CharacterRow | null;
      if (!row || row.ownerId !== uid) throw new Error("That isn't your character.");
      const update: Record<string, string> = {};
      if (typeof patch?.look === "string") update.look = patch.look.slice(0, 400);
      if (typeof patch?.drive === "string") update.drive = patch.drive.slice(0, 200);
      if (typeof patch?.notes === "string") update.notes = patch.notes.slice(0, 2000);
      if (typeof patch?.pronouns === "string") update.pronouns = patch.pronouns.slice(0, 30);
      await ctx.db.characters.update(characterId, update);
    }),

    archiveCharacter: mutation(async (ctx, characterId: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const row = (await ctx.db.characters.get(characterId)) as CharacterRow | null;
      if (!row || row.ownerId !== uid) throw new Error("That isn't your character.");
      await ctx.db.characters.update(characterId, { archived: true });
    }),

    createCampaign: mutation(async (ctx, name: string, adventureKey: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const adventure = findAdventure(adventureKey) ?? ADVENTURES[0];
      let code = "";
      for (let i = 0; i < 20 && !code; i++) {
        const candidate = makeTableCode();
        const taken = await ctx.db.campaigns.withIndex("by_code", (r) => r.eq("code", candidate)).first();
        if (!taken) code = candidate;
      }
      if (!code) throw new Error("Couldn't find a free table code. Try again.");
      await ctx.db.campaigns.insert({
        code,
        name: name.trim().slice(0, 60) || adventure.title,
        hostId: uid,
        adventure: adventure.key,
        prompt: "Waiting for the crew to join…",
      });
      return code;
    }),

    joinCampaign: mutation(async (ctx, code: string, characterId: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      if (campaign.phase === "ended") throw new Error("That campaign has ended.");
      const character = (await ctx.db.characters.get(characterId)) as CharacterRow | null;
      if (!character || character.ownerId !== uid || character.archived) throw new Error("Choose one of your own characters.");
      const seats = (await ctx.db.seats.withIndex("by_campaign", (r) => r.eq("campaignId", campaign.id)).collect()) as Seat[];
      const taken = seats.find((s) => s.active && s.characterId === characterId && s.userId !== uid);
      if (taken) throw new Error("That character is already at this table.");
      const mine = seats.find((s) => s.userId === uid);
      if (mine) {
        if (campaign.phase === "rolls" && mine.active && mine.characterId !== characterId) {
          throw new Error("Wait until the dice are rolled to switch characters.");
        }
        await ctx.db.seats.update(mine.id, { characterId, active: true });
      } else {
        await ctx.db.seats.insert({ campaignId: campaign.id, userId: uid, characterId, active: true });
      }
      return campaign.code;
    }),

    leaveCampaign: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      const seat = (await activeSeats(ctx.db, campaign.id)).find((s) => s.userId === uid);
      if (seat) await ctx.db.seats.update(seat.id, { active: false });
    }),

    removeSeat: mutation(async (ctx, code: string, seatId: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      const seat = (await ctx.db.seats.get(seatId)) as Seat | null;
      if (seat && seat.campaignId === campaign.id) await ctx.db.seats.update(seatId, { active: false });
    }),

    startCampaign: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      if (campaign.phase !== "lobby") return;
      if ((await activeSeats(ctx.db, campaign.id)).length === 0) throw new Error("At least one player needs to join first.");
      const adventure = adventureOf(campaign);
      const scene = adventure.scenes[0];
      const seq = await appendLog(ctx.db, { ...campaign, beat: 1 }, [
        { kind: "scene", text: scene.title },
        { kind: "narration", text: scene.opening, who: "GM" },
      ]);
      await ctx.db.campaigns.update(campaign.id, {
        phase: "actions",
        beat: 1,
        sceneIndex: 0,
        sceneBeats: 0,
        prompt: "Somebody is in the water. What do you do?",
        logSeq: seq,
        optionsJson: JSON.stringify(scene.options),
        phaseAt: new Date().toISOString(),
      });
    }),

    /**
     * Declare (or clear) this beat's action. `move` is a structured choice:
     * a suggested option, helping someone, holding back, or free text, plus an
     * optional ability whose Charge is spent when the beat resolves.
     */
    submitAction: mutation(
      async (
        ctx,
        code: string,
        move: { kind?: string; text?: string; optionIndex?: number; targetId?: string; ability?: string } | null,
      ) => {
        ctx.invalidate(...LIVE_QUERIES);
        const uid = requireUser(ctx.auth as Auth);
        const campaign = await campaignByCode(ctx.db, code);
        if (campaign.phase !== "actions") throw new Error("Hold on. The GM is resolving the last beat.");
        const seats = await activeSeats(ctx.db, campaign.id);
        const seat = seats.find((s) => s.userId === uid);
        if (!seat) throw new Error("Join the table first.");
        const existing = (await actionsFor(ctx.db, campaign.id, campaign.beat)).find((a) => a.characterId === seat.characterId);
        if (!move) {
          if (existing) await ctx.db.actions.delete(existing.id);
          return;
        }
        const me = (await ctx.db.characters.get(seat.characterId)) as CharacterRow;
        const row = {
          text: "",
          kind: "free",
          targetId: "",
          ability: "",
          skill: "",
          risky: true,
          stakes: "",
          done: "",
        };
        if (move.kind === "option") {
          const option = parseOptions(campaign.optionsJson)[Number(move.optionIndex)];
          if (!option) throw new Error("That move isn't available any more.");
          Object.assign(row, { kind: "option", text: option.text, skill: option.skill, risky: option.risky !== false, stakes: option.stakes ?? "", done: option.done ?? "" });
        } else if (move.kind === "help") {
          const target = seats.find((s) => s.characterId === move.targetId && s.characterId !== seat.characterId);
          const targetRow = target ? ((await ctx.db.characters.get(target.characterId)) as CharacterRow | null) : null;
          if (!targetRow) throw new Error("Choose someone at the table to help.");
          Object.assign(row, { kind: "help", targetId: targetRow.id, text: `Helps ${targetRow.name}`, risky: false });
        } else if (move.kind === "hold") {
          Object.assign(row, { kind: "hold", text: "Holds back and watches", risky: false });
        } else {
          const text = String(move.text ?? "").trim().slice(0, 500);
          if (!text) throw new Error("Describe your move.");
          row.text = text;
        }
        if (move.ability) {
          const ability = abilitiesFor(me.origin, me.calling).find((x) => x.name === move.ability);
          if (!ability) throw new Error("You don't have that ability.");
          if (me.charge < ability.cost) throw new Error(`${ability.name} needs ${ability.cost} Charge.`);
          row.ability = ability.name;
          row.text = `${row.text.replace(/[.!]$/, "")}, using ${ability.name}.`;
        }
        if (existing) await ctx.db.actions.update(existing.id, row);
        else await ctx.db.actions.insert({ campaignId: campaign.id, beat: campaign.beat, characterId: seat.characterId, userId: uid, ...row });
      },
    ),

    rollCheck: mutation(async (ctx, checkId: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const check = (await ctx.db.checks.get(checkId)) as CheckRow | null;
      if (!check || check.userId !== uid) throw new Error("That roll isn't yours.");
      if (check.rolled) return parseResult(check.resultJson);
      const campaign = (await ctx.db.campaigns.get(check.campaignId)) as Campaign | null;
      if (!campaign || campaign.phase !== "rolls" || campaign.beat !== check.beat) throw new Error("That roll has expired.");
      return await resolveRoll(ctx.db, campaign, check);
    }),

    rollForAbsent: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      if (campaign.phase !== "rolls") return;
      for (const check of await checksFor(ctx.db, campaign.id, campaign.beat)) {
        if (!check.rolled) {
          const fresh = (await ctx.db.campaigns.get(campaign.id)) as Campaign;
          await resolveRoll(ctx.db, fresh, check);
        }
      }
    }),

    /** Take the GM lock before calling the AI endpoint. */
    beginGm: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      if (campaign.phase === "lobby" || campaign.phase === "ended" || campaign.phase === "rolls") {
        throw new Error("Nothing for the GM to resolve right now.");
      }
      if (campaign.gmBusy && Date.now() - Date.parse(campaign.gmBusyAt || "0") < GM_LOCK_MS) {
        throw new Error("The GM is already thinking.");
      }
      await ctx.db.campaigns.update(campaign.id, { gmBusy: true, gmBusyAt: new Date().toISOString() });
      return campaign.beat;
    }),

    /** Apply a beat produced by the AI endpoint. The signature proves it came from our server. */
    applyGmBeat: mutation(async (ctx, code: string, beat: number, payload: string, signature: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      if (campaign.beat !== beat) return { applied: false, reason: "stale" };
      const expected = await ctx.crypto.hmacSha256({ key: "GM_SIGNING_KEY", data: signingData(campaign.id, beat, payload) });
      if (!(await ctx.crypto.timingSafeEqual(expected, String(signature)))) throw new Error("That GM beat wasn't signed by this server.");
      const seats = await activeSeats(ctx.db, campaign.id);
      const result = sanitizeBeat(JSON.parse(payload), seats.map((s) => s.characterId));
      await applyBeat(ctx.db, campaign, result, "");
      return { applied: true };
    }),

    /** Resolve the beat with the offline backup narrator (no AI). */
    runBackupBeat: mutation(async (ctx, code: string, reason: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      if (campaign.phase === "lobby" || campaign.phase === "ended" || campaign.phase === "rolls") return;
      const context = await gmContext(ctx.db, campaign);
      const beat = sanitizeBeat(backupBeat(context), context.party.map((p) => p.characterId));
      await applyBeat(ctx.db, campaign, beat, `Backup narrator: ${String(reason || "AI GM unavailable").slice(0, 200)}`);
    }),

    releaseGm: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      await ctx.db.campaigns.update(campaign.id, { gmBusy: false });
    }),

    adjustCharacter: mutation(async (ctx, code: string, characterId: string, vigorDelta: number, chargeDelta: number) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      const seats = await activeSeats(ctx.db, campaign.id);
      const seat = seats.find((s) => s.characterId === characterId);
      if (!seat) throw new Error("That character isn't at this table.");
      if (campaign.hostId !== uid && seat.userId !== uid) throw new Error("You can only adjust your own character.");
      const row = (await ctx.db.characters.get(characterId)) as CharacterRow;
      const sheet = toCharacterView(row, null).sheet;
      const vigor = clamp(row.vigor + Math.round(Number(vigorDelta) || 0), 0, sheet.vigorMax);
      const charge = clamp(row.charge + Math.round(Number(chargeDelta) || 0), 0, sheet.chargeMax);
      await ctx.db.characters.update(characterId, { vigor, charge });
    }),

    restCrew: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      for (const seat of await activeSeats(ctx.db, campaign.id)) {
        const row = (await ctx.db.characters.get(seat.characterId)) as CharacterRow | null;
        if (!row) continue;
        const sheet = toCharacterView(row, null).sheet;
        await ctx.db.characters.update(row.id, { vigor: sheet.vigorMax, charge: sheet.chargeMax });
      }
      const seq = await appendLog(ctx.db, campaign, [{ kind: "system", text: "The crew rests. Vigor and Charge are restored." }]);
      await ctx.db.campaigns.update(campaign.id, { logSeq: seq });
    }),

    endCampaign: mutation(async (ctx, code: string) => {
      ctx.invalidate(...LIVE_QUERIES);
      const uid = requireUser(ctx.auth as Auth);
      const campaign = await campaignByCode(ctx.db, code);
      requireHost(campaign, uid);
      const seq = await appendLog(ctx.db, campaign, [{ kind: "system", text: "The table has ended this campaign." }]);
      await ctx.db.campaigns.update(campaign.id, { phase: "ended", gmBusy: false, logSeq: seq, prompt: "The campaign has ended.", phaseAt: new Date().toISOString() });
    }),
  },

  endpoints: {
    health: endpoint({ method: "GET", path: "/api/health" }, () => json({ ok: true, game: "wakefield" })),

    /**
     * Produce the next GM beat with Claude. Read-only (so it gets the longer
     * outbound fetch budget); the table applies the signed result through the
     * applyGmBeat mutation.
     */
    gmBeat: endpoint({ method: "POST", path: "/api/gm/beat", readOnly: true }, async (ctx, req) => {
      const auth = ctx.auth as Auth;
      if (!auth.userId) return json({ ok: false, error: "Not signed in." }, { status: 401 });
      let code = "";
      try {
        code = String(((await req.json()) as { code?: string })?.code ?? "");
      } catch {
        return json({ ok: false, error: "Bad request." }, { status: 400 });
      }
      const clean = normalizeCode(code);
      const campaign = (await ctx.db.campaigns.withIndex("by_code", (r) => r.eq("code", clean)).first()) as Campaign | null;
      if (!campaign) return json({ ok: false, error: "No such table." }, { status: 404 });
      if (campaign.hostId !== auth.userId) return json({ ok: false, error: "Only the table can run the GM." }, { status: 403 });

      const context = await gmContext(ctx.db, campaign);
      try {
        const started = Date.now();
        const raw = await callClaude(context, ctx.env);
        const beat = sanitizeBeat(raw, context.party.map((p) => p.characterId));
        const payload = JSON.stringify(beat);
        const signature = await ctx.crypto.hmacSha256({ key: "GM_SIGNING_KEY", data: signingData(campaign.id, campaign.beat, payload) });
        ctx.log.info("gm beat", { code: clean, beat: campaign.beat, ms: Date.now() - started });
        return json({ ok: true, beat: campaign.beat, payload, signature });
      } catch (error) {
        const message = error instanceof GmError ? error.message : error instanceof Error ? error.message : "Unknown error";
        ctx.log.warn("gm beat failed", { code: clean, message });
        return json({ ok: false, error: message });
      }
    }),
  },
});

async function resolveRoll(db: Db, campaign: Campaign, check: CheckRow) {
  const row = (await db.characters.get(check.characterId)) as CharacterRow | null;
  if (!row) throw new Error("Character not found.");
  const view = toCharacterView(row, null);
  let edge = check.edge === "boost" || check.edge === "snag" ? check.edge : "none";
  // Down characters roll with Snag (Boost and Snag cancel).
  if (row.vigor === 0) edge = edge === "boost" ? "none" : "snag";
  const modifier = checkModifier(view.sheet, check.skill as SkillKey);
  const result = { ...rollCheck({ modifier, difficulty: check.difficulty, edge: edge as "boost" | "snag" | "none" }), skill: check.skill, edge };
  await db.checks.update(check.id, { rolled: true, resultJson: JSON.stringify(result) });
  const skillName = findSkill(check.skill)?.name ?? check.skill;
  const dice = result.dice.length > 1 ? `[${result.dice.join(", ")}] → ${result.kept}` : `${result.kept}`;
  const seq = await appendLog(db, campaign, [
    {
      kind: "roll",
      who: row.name,
      characterId: row.id,
      text: `${skillName} ${formatModifier(modifier)}: rolled ${dice}, total ${result.total} vs ${difficultyName(check.difficulty)} ${check.difficulty} — ${OUTCOME_LABEL[result.outcome]}`,
      data: result,
    },
  ]);
  const remaining = (await checksFor(db, campaign.id, campaign.beat)).filter((c) => !c.rolled && c.id !== check.id);
  await db.campaigns.update(campaign.id, { logSeq: seq, ...(remaining.length === 0 ? { phase: "outcome", phaseAt: new Date().toISOString() } : {}) });
  return result;
}

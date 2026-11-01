// Shapes the server returns to the client. Shared so both sides agree.
import type { CheckResult } from "./rules.ts";
import type { Mode, MoveOption, Phase } from "./gm.ts";
import type { Sheet, Stats } from "./rules.ts";

export type CharacterRow = {
  id: string;
  ownerId: string;
  name: string;
  pronouns: string;
  look: string;
  drive: string;
  origin: string;
  variant: string;
  calling: string;
  background: string;
  statsJson: string;
  vigor: number;
  charge: number;
  xp: number;
  level: number;
  scars: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CharacterView = {
  id: string;
  name: string;
  pronouns: string;
  look: string;
  drive: string;
  origin: string;
  variant: string;
  calling: string;
  background: string;
  baseStats: Stats;
  sheet: Sheet;
  vigor: number;
  charge: number;
  xp: number;
  level: number;
  scars: string;
  notes: string;
  isMine: boolean;
};

export type LogView = {
  id: string;
  seq: number;
  kind: "scene" | "narration" | "action" | "roll" | "whisper" | "effect" | "system";
  text: string;
  who: string;
  characterId: string;
  private: boolean;
  roll?: CheckResult & { skill: string; edge: string };
};

export type CampaignView = {
  id: string;
  code: string;
  name: string;
  phase: Phase;
  beat: number;
  mode: Mode;
  prompt: string;
  adventureTitle: string;
  sceneTitle: string;
  sceneIndex: number;
  sceneCount: number;
  gmBusy: boolean;
  gmNotice: string;
  isHost: boolean;
  /** When the current phase began (ISO). Drives "skip waiting" timeouts. */
  phaseAt: string;
  /** The GM's running summary: the ending recap. */
  summary: string;
  adventurePitch: string;
};

export type CheckView = {
  id: string;
  characterId: string;
  skill: string;
  difficulty: number;
  edge: string;
  reason: string;
  stakes: string;
  rolled: boolean;
  result: (CheckResult & { skill: string; edge: string }) | null;
};

export type SeatView = {
  seatId: string;
  userId: string;
  handle: string;
  ready: boolean;
  character: CharacterView;
  check: CheckView | null;
};

export type TableView = {
  campaign: CampaignView;
  seats: SeatView[];
  log: LogView[];
};

export type PlayerView = {
  campaign: CampaignView;
  seat: SeatView | null;
  party: { characterId: string; name: string; vigor: number; vigorMax: number; ready: boolean; isMe: boolean }[];
  myAction: string;
  myActionAbility: string;
  /** Suggested moves for this beat. */
  options: MoveOption[];
  /** The latest line of story, so the phone isn't blind. */
  latestStory: string;
  /** What happened to me in the beat that just resolved. */
  myEffects: string[];
  /** The latest private message to me, if it arrived in the last resolved beat or later. */
  whisper: string;
  log: LogView[];
};

export type MeView = {
  userId: string;
  isGuest: boolean;
  handle: string;
  hasHandle: boolean;
};

export type CampaignSummary = {
  code: string;
  name: string;
  phase: Phase;
  adventureTitle: string;
  role: "host" | "player";
  updatedAt: string;
};

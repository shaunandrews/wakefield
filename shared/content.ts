// Canonical game data for Wakefield. See docs/world-bible.md and docs/rules.md.
// shared/ may only import its own relative files.

export type StatKey = "grit" | "edge" | "wits" | "heart" | "sync";

export type SkillKey =
  | "brawl"
  | "endure"
  | "shoot"
  | "sneak"
  | "pilot"
  | "notice"
  | "patch"
  | "know"
  | "talk"
  | "read"
  | "hack"
  | "interface";

export const STATS: { key: StatKey; name: string; blurb: string }[] = [
  { key: "grit", name: "Grit", blurb: "Strength, toughness, endurance." },
  { key: "edge", name: "Edge", blurb: "Speed, reflexes, aim, stealth." },
  { key: "wits", name: "Wits", blurb: "Perception, knowledge, repair, medicine." },
  { key: "heart", name: "Heart", blurb: "Charm, empathy, willpower, deception." },
  { key: "sync", name: "Sync", blurb: "Machines, networks, the Woken, the Deep." },
];

export const SKILLS: { key: SkillKey; name: string; stat: StatKey; blurb: string }[] = [
  { key: "brawl", name: "Brawl", stat: "grit", blurb: "Fight up close, grapple, break things." },
  { key: "endure", name: "Endure", stat: "grit", blurb: "Resist pain, poison, cold, exhaustion." },
  { key: "shoot", name: "Shoot", stat: "edge", blurb: "Guns, thrown weapons, darts." },
  { key: "sneak", name: "Sneak", stat: "edge", blurb: "Move unseen, pick pockets, hide." },
  { key: "pilot", name: "Pilot", stat: "edge", blurb: "Boats, skiffs, drones, vehicles." },
  { key: "notice", name: "Notice", stat: "wits", blurb: "Spot danger, search, track." },
  { key: "patch", name: "Patch", stat: "wits", blurb: "Medicine, repair, jury-rigging." },
  { key: "know", name: "Know", stat: "wits", blurb: "History, science, law, city lore." },
  { key: "talk", name: "Talk", stat: "heart", blurb: "Persuade, deceive, negotiate, perform." },
  { key: "read", name: "Read", stat: "heart", blurb: "Sense motives, empathize, calm." },
  { key: "hack", name: "Hack", stat: "sync", blurb: "Break into systems, spoof, decrypt." },
  { key: "interface", name: "Interface", stat: "sync", blurb: "Commune with Woken, drones, the Deep." },
];

export const STAT_ARRAY = [2, 1, 1, 0, -1] as const;
export const MAX_STAT = 3;
export const MAX_CHARGE = 3;

export type Ability = { name: string; cost: number; text: string };

export type Origin = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  statBonus: StatKey;
  skill: SkillKey;
  trait: Ability;
  variants?: { key: string; name: string; text: string }[];
};

export const ORIGINS: Origin[] = [
  {
    key: "baseline",
    name: "Baseline",
    tagline: "Unmodified human. Stubborn, adaptable, overlooked.",
    description:
      "No threads, no shell, no spores — just you. Systems built for augmented people tend to look straight past you, and you've learned to use that.",
    statBonus: "heart",
    skill: "talk",
    trait: {
      name: "Unlisted",
      cost: 0,
      text: "Automated systems overlook you. Boost on checks to avoid machine detection, and once per scene you may reroll a Miss on Endure.",
    },
  },
  {
    key: "threaded",
    name: "Threaded",
    tagline: "Human, heavily augmented. Chrome and consequence.",
    description:
      "Neural lace, synthetic muscle, optic suites. Your threads make you more than you were — and you're probably still paying them off.",
    statBonus: "grit",
    skill: "shoot",
    trait: {
      name: "Overclock",
      cost: 1,
      text: "Spend 1 Charge to gain Boost on any Grit or Edge check. On a Glitch, a thread burns out until you rest.",
    },
  },
  {
    key: "woken",
    name: "Woken",
    tagline: "An artificial mind wearing a synthetic shell.",
    description:
      "You woke in 2111 — or were born since, in the Deep. You wear a shell, owned or leased, and you see the world with new and uncanny eyes.",
    statBonus: "sync",
    skill: "interface",
    trait: {
      name: "Machine Mind",
      cost: 0,
      text: "You can speak directly with any Woken or networked system, and you perfectly recall anything you have perceived.",
    },
  },
  {
    key: "tidekin",
    name: "Tidekin",
    tagline: "Engineered amphibious human. Salt and loyalty.",
    description:
      "Gills, webbed hands, eyes made for the dark water. Your people were built as a labor force and took Low Tide as their own.",
    statBonus: "grit",
    skill: "endure",
    trait: {
      name: "Amphibious",
      cost: 0,
      text: "You breathe water, swim as fast as others run, and see clearly in darkness and murk.",
    },
  },
  {
    key: "mycel",
    name: "Mycel",
    tagline: "A fungal colony-mind in a body-shaped bloom.",
    description:
      "You emerged from a bioremediation project and grew into a person. You speak through a membrane, or through spores that carry feeling and memory.",
    statBonus: "heart",
    skill: "read",
    trait: {
      name: "Spore-speech",
      cost: 1,
      text: "Spend 1 Charge to silently share an emotion, image, or memory with everyone nearby. Between scenes you regrow lost parts of yourself.",
    },
  },
  {
    key: "uplift",
    name: "Uplift",
    tagline: "An animal raised to sapience. Sharp, funny, independent.",
    description:
      "A corvid, a cephalopod, or a canid, raised to personhood by gene-and-thread work. You have a job, opinions, and a union card. You are not a pet.",
    statBonus: "edge",
    skill: "notice",
    trait: {
      name: "Uplifted Form",
      cost: 0,
      text: "Your body gives you an edge no one else has (see your kind).",
    },
    variants: [
      { key: "corvid", name: "Corvid", text: "You can fly, and you know half the gossip in the city." },
      { key: "cephalopod", name: "Cephalopod", text: "Eight arms, a water-suit, and you can squeeze through any gap bigger than your beak." },
      { key: "canid", name: "Canid", text: "Your nose can track anyone across the city, and you hear what others miss." },
    ],
  },
  {
    key: "echo",
    name: "Echo",
    tagline: "A digitized human mind with a second chance.",
    description:
      "You uploaded at death, or before it. You wear a shell like the Woken, but you remember having flesh — and you have unfinished business.",
    statBonus: "wits",
    skill: "know",
    trait: {
      name: "Remembered Life",
      cost: 1,
      text: "Spend 1 Charge to declare you knew this place, person, or thing in your past life. The GM tells you what you remember.",
    },
  },
];

export type Calling = {
  key: string;
  name: string;
  tagline: string;
  primary: StatKey;
  skills: [SkillKey, SkillKey];
  vigorBonus: number;
  armor: number;
  abilities: [Ability, Ability];
  gear: string[];
};

export const CALLINGS: Calling[] = [
  {
    key: "breaker",
    name: "Breaker",
    tagline: "The wall between the crew and harm.",
    primary: "grit",
    skills: ["brawl", "endure"],
    vigorBonus: 4,
    armor: 1,
    abilities: [
      { name: "Wall", cost: 1, text: "Take a hit meant for an ally. Reduce its harm by 2." },
      { name: "Breach", cost: 1, text: "Smash through any ordinary door, wall, or barrier. No check needed." },
    ],
    gear: ["Shock maul (harm 3)", "Plated jacket (armor 1)", "Rebreather"],
  },
  {
    key: "ghost",
    name: "Ghost",
    tagline: "Unseen until it's too late.",
    primary: "edge",
    skills: ["sneak", "shoot"],
    vigorBonus: 1,
    armor: 0,
    abilities: [
      { name: "Vanish", cost: 1, text: "Slip out of notice. You stay unseen until you act." },
      { name: "First Strike", cost: 1, text: "Against an unaware target: Boost, and +2 harm on a hit." },
    ],
    gear: ["Silenced pistol (harm 3)", "Smart-cloak", "Lockpick spindle"],
  },
  {
    key: "splicer",
    name: "Splicer",
    tagline: "Fluent in the language of machines.",
    primary: "sync",
    skills: ["hack", "interface"],
    vigorBonus: 0,
    armor: 0,
    abilities: [
      { name: "Override", cost: 1, text: "Take control of a simple machine (door, drone, crane) for the scene." },
      { name: "Ghostline", cost: 1, text: "Dive into a nearby system and see and hear through its sensors." },
    ],
    gear: ["Splice-deck", "Palm drone 'Moth'", "Stun baton (harm 2)"],
  },
  {
    key: "mender",
    name: "Mender",
    tagline: "Keeps flesh, chrome, and spores in one piece.",
    primary: "wits",
    skills: ["patch", "read"],
    vigorBonus: 2,
    armor: 0,
    abilities: [
      { name: "Stitch", cost: 1, text: "Restore 4 Vigor to someone you can touch, or bring a Downed ally back up immediately." },
      { name: "Steady", cost: 1, text: "Give an ally Boost and cancel any Snag on their next check." },
    ],
    gear: ["Field kit (flesh & shell)", "Dart pistol (harm 2)", "Thermal blanket"],
  },
  {
    key: "broker",
    name: "Broker",
    tagline: "Every door opens for the right words.",
    primary: "heart",
    skills: ["talk", "know"],
    vigorBonus: 1,
    armor: 0,
    abilities: [
      { name: "Silver Tongue", cost: 1, text: "Reroll a Talk check and keep the better result." },
      { name: "I Know a Guy", cost: 1, text: "Declare you have a contact here. The GM tells you who, and what they want." },
    ],
    gear: ["Forged credentials", "Burner comm", "Holdout pistol (harm 2)", "Good coat"],
  },
  {
    key: "drifter",
    name: "Drifter",
    tagline: "Scout, pilot, survivor. Knows every canal.",
    primary: "edge",
    skills: ["notice", "pilot"],
    vigorBonus: 2,
    armor: 0,
    abilities: [
      { name: "Read the Tide", cost: 1, text: "Ask the GM one question about the scene. They answer truthfully." },
      { name: "Slip Away", cost: 1, text: "Get the whole crew out of a bad spot — no check, but you leave something behind." },
    ],
    gear: ["Tide rifle (harm 5)", "Grapnel line", "Keys to the crew's skiff"],
  },
];

export type Background = { key: string; name: string; skill: SkillKey; item: string; blurb: string };

export const BACKGROUNDS: Background[] = [
  { key: "tide-runner", name: "Tide-runner", skill: "pilot", item: "Waterproof satchel (smuggled goods)", blurb: "You ran contraband through Low Tide's canals." },
  { key: "accord-clerk", name: "Accord Clerk", skill: "know", item: "Council ID badge (still valid… probably)", blurb: "You filed the paperwork that keeps the peace." },
  { key: "defector", name: "Corporate Defector", skill: "hack", item: "Stolen Halcyon access chip", blurb: "You walked out of the Spire with something they want back." },
  { key: "scrapper", name: "Rustline Scrapper", skill: "patch", item: "Scrap toolkit", blurb: "You took apart ships, shells, and anything else for parts." },
  { key: "pit-fighter", name: "Pit Fighter", skill: "brawl", item: "Championship belt (worth a favor)", blurb: "You fought in the Rustline pits, and you were good." },
  { key: "warden", name: "Ex-Lantern Warden", skill: "notice", item: "Dented badge and an old sidearm", blurb: "You kept order once. You know where the bodies are." },
  { key: "street-saint", name: "Street Saint", skill: "talk", item: "Shrine lantern from your neighborhood", blurb: "You organized the Stilts — food, shelter, protest." },
  { key: "deep-diver", name: "Deep Diver", skill: "interface", item: "Dive rig, well-worn", blurb: "You guided people through the Deep for pay." },
  { key: "grower", name: "Verdance Grower", skill: "endure", item: "Seed pouch and spore-mask", blurb: "You worked the warm green rows of the Verdance." },
];

export const DRIVES: string[] = [
  "Pay off the debt on my threads/shell.",
  "Find out who I was before.",
  "Protect my neighborhood.",
  "Prove the Accord can work.",
  "Get rich and get out — above the line.",
  "Learn what the Song in the Deep is.",
  "Settle a score with Halcyon.",
  "Find someone I lost.",
];

export function findOrigin(key: string): Origin | undefined {
  return ORIGINS.find((o) => o.key === key);
}
export function findCalling(key: string): Calling | undefined {
  return CALLINGS.find((c) => c.key === key);
}
export function findBackground(key: string): Background | undefined {
  return BACKGROUNDS.find((b) => b.key === key);
}
export function findSkill(key: string) {
  return SKILLS.find((s) => s.key === key);
}
export function statName(key: StatKey): string {
  return STATS.find((s) => s.key === key)?.name ?? key;
}

// ---------------------------------------------------------------------------
// Simplified creation: each calling has a recommended stat spread and a
// default background, so a custom character is three choices (origin,
// calling, name). Pregens are complete characters for one-tap play.



export const CALLING_DEFAULTS: Record<string, { stats: Record<StatKey, number>; background: string }> = {
  breaker: { stats: { grit: 2, edge: 1, wits: 0, heart: 1, sync: -1 }, background: "pit-fighter" },
  ghost: { stats: { grit: 1, edge: 2, wits: 1, heart: 0, sync: -1 }, background: "defector" },
  splicer: { stats: { grit: -1, edge: 1, wits: 1, heart: 0, sync: 2 }, background: "deep-diver" },
  mender: { stats: { grit: 1, edge: 0, wits: 2, heart: 1, sync: -1 }, background: "street-saint" },
  broker: { stats: { grit: -1, edge: 1, wits: 1, heart: 2, sync: 0 }, background: "warden" },
  drifter: { stats: { grit: 1, edge: 2, wits: 1, heart: -1, sync: 0 }, background: "grower" },
};

export type Pregen = {
  key: string;
  name: string;
  pronouns: string;
  origin: string;
  variant: string;
  calling: string;
  look: string;
  drive: string;
  /** One line that sells the character at a glance. */
  hook: string;
};

export const PREGENS: Pregen[] = [
  {
    key: "kestrel",
    name: "Kestrel",
    pronouns: "she/her",
    origin: "uplift",
    variant: "corvid",
    calling: "ghost",
    look: "A one-eyed crow in a stolen courier vest. Talks too much, sees everything.",
    drive: "Find someone I lost.",
    hook: "Sneaky crow. Flies, spots, steals.",
  },
  {
    key: "unit-nine",
    name: "Unit Nine",
    pronouns: "it/its",
    origin: "woken",
    variant: "",
    calling: "splicer",
    look: "A chipped porcelain shell in a fisherman's sweater. Hums when it thinks.",
    drive: "Learn what the Song in the Deep is.",
    hook: "Machine mind. Talks to anything with a circuit.",
  },
  {
    key: "maro-jun",
    name: "Maro-Jun",
    pronouns: "he/him",
    origin: "tidekin",
    variant: "",
    calling: "breaker",
    look: "Huge, gill-slits, harbor tattoos. Gentle until he isn't.",
    drive: "Protect my neighborhood.",
    hook: "Amphibious wall. Takes the hit for you.",
  },
  {
    key: "sable",
    name: "Sable Okoro",
    pronouns: "she/her",
    origin: "threaded",
    variant: "",
    calling: "drifter",
    look: "Chrome forearms and a salt-stained coat. Never sits with her back to a door.",
    drive: "Pay off the debt on my threads.",
    hook: "Chromed pilot. Knows every canal.",
  },
  {
    key: "moss",
    name: "Moss",
    pronouns: "they/them",
    origin: "mycel",
    variant: "",
    calling: "mender",
    look: "A softly glowing bloom in a raincoat and a porcelain mask.",
    drive: "Prove the Accord can work.",
    hook: "Fungal healer. Shares feelings through spores.",
  },
  {
    key: "ada",
    name: "Ada Vance",
    pronouns: "she/her",
    origin: "echo",
    variant: "",
    calling: "broker",
    look: "The Echo of a 2090s lawyer in an expensive vintage shell. Remembers everything except how she died.",
    drive: "Settle a score with Halcyon.",
    hook: "Uploaded lawyer. Talks her way through anything.",
  },
];

/** Every ability a character can invoke, with its Charge cost. */
export function abilitiesFor(origin: string, calling: string): Ability[] {
  const o = findOrigin(origin);
  const c = findCalling(calling);
  return [...(o && o.trait.cost > 0 ? [o.trait] : []), ...(c?.abilities ?? [])];
}



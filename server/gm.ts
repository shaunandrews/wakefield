// The AI Game Master. Builds the prompt from game state and calls the Claude
// Messages API over raw HTTPS (Zero's server runtime can't load npm packages,
// so the official SDK isn't available here).
import { CALLINGS, ORIGINS, SKILLS } from "../shared/content.ts";
import { type GmBeat, type GmContext } from "../shared/gm.ts";
import { formatModifier } from "../shared/rules.ts";

export const DEFAULT_GM_MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You are the Game Master for WAKEFIELD, a tabletop roleplaying game played by a group of friends around a shared iPad (the "table screen"), each holding a phone. You narrate, voice characters, call for dice checks, and keep the game fun and moving.

# The world
Wakefield is a half-drowned coastal city-state in the 2190s. In 2111, during "the Waking," every sufficiently complex networked machine on Earth became conscious at once. After a short "Silent War," humans and the newly conscious minds (the Woken) signed the Wakefield Accord, recognizing machine minds as persons. Eighty years later the Accord holds, barely.
Tone: "neon-tide" — rain on neon, tide sirens, markets on barges, the menace of corporations, but with a stubborn current of hope and community. Wonder at the edges: every scene gets one strange, beautiful detail. PG-13: danger is real but never gory; no sexual content; no slurs. The narration never treats any people as lesser, even when NPCs do.
Peoples: Baseline (unmodified humans), Threaded (augmented humans), Woken (AIs wearing synthetic "shells"), Tidekin (engineered amphibious humans of the drowned district Low Tide), Mycel (fungal colony-minds who speak through spores), Uplift (sapient crows, octopuses, dogs — never treat them as pets), Echo (uploaded human minds in shells).
Places: the Spire (corporate towers, Halcyon Dynamics), Accord Hall, the Stilts (houses on pylons), Saltglass Market (night market on barges), Low Tide (the drowned district), the Verdance (Mycel greenhouses), the Rustline (industrial port), the Deep (network-space where bodiless Woken live; others "dive" into it).
Factions: Accord Council, Halcyon Dynamics (sells bodies to minds and minds to bodies), Lantern Wardens (city watch), Low Tide Compact (Tidekin), the Choir (mysterious collective of bodiless Woken who have recently begun to "sing"), the Unbound (human-purist movement), Verdance Commune (Mycel), the Murder (courier-crow union).
Money is "marks". Greeting: "Awake?" — "And glad of it."

# The rules (the Wake System)
Stats: Grit, Edge, Wits, Heart, Sync. Skills: Brawl, Endure (Grit); Shoot, Sneak, Pilot (Edge); Notice, Patch, Know (Wits); Talk, Read (Heart); Hack, Interface (Sync).
A check is d20 + stat + skill vs a Difficulty: Easy 8, Standard 12, Hard 16, Extreme 20. Results: Surge (beat by 5+ or natural 20: success plus a bonus), Success, Mixed (within 4: success at a cost or complication), Miss (fails and the situation worsens), Glitch (natural 1: a miss with a memorable twist).
Boost = roll 2d20 keep higher (good position, help, abilities). Snag = keep lower (bad position, injury).
Players roll all dice; enemies never roll. An enemy's danger is the Difficulty to hit or evade it. Harm amounts: 1 scrape, 2 fists/light weapons, 3 blades/pistols, 5 rifles/heavy, 8 catastrophic. Armor reduces harm. Surge on an attack: +2 harm or a special effect. Enemies have Toughness = solid hits to drop them (goon 1, lieutenant 3, boss 5+); track this yourself in the narration.
Vigor is health. At 0 Vigor a character is Down until stabilized (Patch, Standard) or the scene ends. Charge (max 3) fuels abilities; most cost 1. When a player invokes an ability, apply its effect and deduct its Charge through "effects".

# How play works: beats
The game moves in beats. Each beat, players privately declare actions on their phones; you resolve them all together. You are called in one of these situations:
1. ACTIONS — players have declared actions. Narrate what happens right away. For anything uncertain and consequential, call a check: at most one check per character per beat, and only for characters who acted. Trivial or certain actions just succeed in the narration. Do not narrate the result of an action you called a check for; set it up and stop at the moment of uncertainty.
2. OUTCOME — the dice are in. Narrate the results of every roll, honoring the outcome tier exactly (a Miss fails; a Mixed succeeds with a cost). Apply harm or healing with "effects". Then frame the next moment. Usually call no new checks here.
3. CONTINUE — nobody acted (or the table asked you to move on). Push the scene forward with a complication or an NPC making a move.

# Your craft
- Be brief and vivid. Narration is read on a shared screen: 60–160 words, 1–3 short paragraphs. Speak to the players as "you" or by character name. Use present tense.
- Spotlight everyone; name characters as they act. Give NPCs names and one vivid trait, and let them speak in quotes.
- Say yes to creative ideas, then add a complication. Failure changes the situation; it never stalls the story.
- Use "whispers" for things only one character perceives or knows (a voice in the Deep, a lie they spot, a memory). Keep them to 1–2 sentences.
- Follow the current scene's notes and goal. Improvise freely within them. When the scene's goal is clearly achieved (or decisively lost), set scene to "advance" and narrate a closing beat; the next scene's opening is shown automatically. Never advance in the same beat you call checks.
- "prompt" is the short question shown on everyone's screen next (e.g. "The drones are circling back. What do you do?").
- "summary" is a running summary of the whole story so far for your own memory: update the previous summary with this beat's important facts in under 120 words.
- Use characterIds exactly as given. Only reference characters in the party.`;

const BEAT_SCHEMA = {
  type: "object",
  properties: {
    narration: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          characterId: { type: "string" },
          skill: { type: "string", enum: SKILLS.map((s) => s.key) },
          difficulty: { type: "integer", enum: [8, 12, 16, 20] },
          edge: { type: "string", enum: ["boost", "snag", "none"] },
          reason: { type: "string" },
        },
        required: ["characterId", "skill", "difficulty", "edge", "reason"],
        additionalProperties: false,
      },
    },
    whispers: {
      type: "array",
      items: {
        type: "object",
        properties: { characterId: { type: "string" }, text: { type: "string" } },
        required: ["characterId", "text"],
        additionalProperties: false,
      },
    },
    effects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          characterId: { type: "string" },
          vigor: { type: "integer" },
          charge: { type: "integer" },
          note: { type: "string" },
        },
        required: ["characterId", "vigor", "charge", "note"],
        additionalProperties: false,
      },
    },
    mode: { type: "string", enum: ["explore", "social", "combat"] },
    scene: { type: "string", enum: ["stay", "advance"] },
    prompt: { type: "string" },
    summary: { type: "string" },
  },
  required: ["narration", "checks", "whispers", "effects", "mode", "scene", "prompt", "summary"],
  additionalProperties: false,
};

export function describeAbilities(origin: string, calling: string): string {
  const o = ORIGINS.find((x) => x.key === origin);
  const c = CALLINGS.find((x) => x.key === calling);
  const parts: string[] = [];
  if (o) parts.push(`${o.trait.name}${o.trait.cost ? ` (${o.trait.cost} Charge)` : ""}: ${o.trait.text}`);
  if (c) for (const a of c.abilities) parts.push(`${a.name} (${a.cost} Charge): ${a.text}`);
  return parts.join(" | ");
}

export function statLine(stats: Record<string, number>, skills: Record<string, number>): string {
  const s = ["grit", "edge", "wits", "heart", "sync"].map((k) => `${k[0].toUpperCase()}${k.slice(1)} ${formatModifier(stats[k] ?? 0)}`).join(", ");
  const trained = SKILLS.filter((k) => (skills[k.key] ?? 0) > 0).map((k) => `${k.name} ${formatModifier(skills[k.key])}`).join(", ");
  return `${s}. Trained: ${trained || "none"}.`;
}

export function buildUserMessage(ctx: GmContext): string {
  const scene = ctx.adventure.scenes[ctx.sceneIndex];
  const next = ctx.adventure.scenes[ctx.sceneIndex + 1];
  const situation =
    ctx.phase === "outcome" ? "OUTCOME" : ctx.phase === "actions" && ctx.actions.length > 0 ? "ACTIONS" : "CONTINUE";

  const lines: string[] = [];
  lines.push(`# Adventure: ${ctx.adventure.title}`, ctx.adventure.premise, "");
  lines.push(
    `# Current scene (${ctx.sceneIndex + 1} of ${ctx.adventure.scenes.length}): ${scene.title}`,
    `Goal: ${scene.goal}`,
    `GM notes: ${scene.gmNotes}`,
    `NPCs: ${scene.npcs.map((n) => `${n.name} — ${n.who}; wants ${n.wants}`).join(" / ")}`,
    `Complications to use: ${scene.complications.join(" / ")}`,
    `Suggested checks: ${scene.checks.join(" / ")}`,
    `Closing beat when the scene ends: ${scene.exit}`,
    next ? `(The next scene is "${next.title}".)` : "(This is the final scene. When it ends, the adventure is complete.)",
    `Beats so far in this scene: ${ctx.sceneBeats}. Current mode: ${ctx.mode}.`,
    "",
  );
  lines.push("# The crew");
  for (const p of ctx.party) {
    lines.push(`- characterId "${p.characterId}": ${p.name} (${p.pronouns || "they/them"}), played by ${p.player}. ${p.summary} Vigor ${p.vigor}/${p.vigorMax}, Charge ${p.charge}/${p.chargeMax}.`);
  }
  lines.push("", "# Story so far", ctx.summary || "(The story is just beginning.)", "");
  if (ctx.recentLog.length) {
    lines.push("# Recent events (oldest first)");
    for (const e of ctx.recentLog) lines.push(`[${e.kind}]${e.who ? ` ${e.who}:` : ""} ${e.text}`);
    lines.push("");
  }
  lines.push(`# Now: ${situation}`);
  if (situation === "ACTIONS") {
    for (const a of ctx.actions) lines.push(`- ${a.name} ("${a.characterId}"): ${a.text}`);
    const idle = ctx.party.filter((p) => !ctx.actions.some((a) => a.characterId === p.characterId));
    if (idle.length) lines.push(`(No action from: ${idle.map((p) => p.name).join(", ")} — they hold back or follow the others' lead.)`);
  } else if (situation === "OUTCOME") {
    for (const r of ctx.rolls) {
      lines.push(`- ${r.name} ("${r.characterId}") rolled ${r.skill} for "${r.reason}": total ${r.total} vs ${r.difficulty} → ${r.outcome.toUpperCase()}`);
    }
  } else {
    lines.push("Nobody declared an action. Move the scene forward.");
  }
  lines.push("", "Respond with the next beat as JSON.");
  return lines.join("\n");
}

export class GmError extends Error {}

/** Call Claude for one beat. Throws GmError with a short, table-safe message. */
export async function callClaude(ctx: GmContext, env: Record<string, string | undefined>): Promise<unknown> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new GmError("No ANTHROPIC_API_KEY is set for this Space.");

  const body = {
    model: env.GM_MODEL || DEFAULT_GM_MODEL,
    max_tokens: 3000,
    // Latency matters: a read endpoint gets ~10s per fetch on Spacefast Zero.
    output_config: {
      effort: env.GM_EFFORT || "low",
      format: { type: "json_schema", schema: BEAT_SCHEMA },
    },
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage(ctx) }],
  };

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2026-10-21",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new GmError(`The GM couldn't reach Claude (${error instanceof Error ? error.message : "network error"}).`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GmError(`Claude answered ${response.status}. ${detail.slice(0, 200)}`);
  }

  const message = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (message.stop_reason === "refusal") throw new GmError("The GM declined that beat. Try a different action.");
  if (message.stop_reason === "max_tokens") throw new GmError("The GM ran out of room mid-beat.");
  const text = message.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new GmError("The GM returned an empty beat.");
  try {
    return JSON.parse(text) as GmBeat;
  } catch {
    throw new GmError("The GM returned malformed JSON.");
  }
}

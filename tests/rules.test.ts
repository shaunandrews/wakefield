import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFromChoices, deriveSheet, isValidArray, outcomeFor, rollCheck, validateDraft, makeTableCode, normalizeCode, nearestDifficulty } from "../shared/rules.ts";
import { backupBeat, guessSkill, sanitizeBeat, stripMechanics } from "../shared/gm.ts";
import { ADVENTURES } from "../shared/adventures.ts";
import { CALLINGS, ORIGINS, BACKGROUNDS, SKILLS, PREGENS, CALLING_DEFAULTS } from "../shared/content.ts";

const stats = { grit: 2, edge: 1, wits: 1, heart: 0, sync: -1 };

test("stat array validation", () => {
  assert.equal(isValidArray(stats), true);
  assert.equal(isValidArray({ ...stats, sync: 2 }), false);
});

test("sheet derivation applies origin bonus, skills, and vigor", () => {
  const sheet = deriveSheet({ origin: "threaded", calling: "breaker", background: "pit-fighter", stats });
  assert.equal(sheet.stats.grit, 3); // +2 base, +1 Threaded
  assert.equal(sheet.skills.brawl, 4); // Breaker + Pit Fighter => expert
  assert.equal(sheet.skills.shoot, 2); // Threaded
  assert.equal(sheet.skills.hack, 0);
  assert.equal(sheet.vigorMax, 8 + 3 * 2 + 4);
  assert.equal(sheet.armor, 1);
});

test("origin bonus caps at +3 and vigor has a floor", () => {
  const sheet = deriveSheet({ origin: "woken", calling: "splicer", background: "deep-diver", stats: { grit: -1, edge: 0, wits: 1, heart: 1, sync: 2 } });
  assert.equal(sheet.stats.sync, 3);
  assert.equal(sheet.vigorMax, 6);
  assert.equal(sheet.skills.interface, 4);
});

test("outcomes follow the degree-of-success table", () => {
  assert.equal(outcomeFor(20, 5, 20), "surge");
  assert.equal(outcomeFor(1, 30, 8), "glitch");
  assert.equal(outcomeFor(10, 17, 12), "surge");
  assert.equal(outcomeFor(10, 12, 12), "success");
  assert.equal(outcomeFor(10, 8, 12), "mixed");
  assert.equal(outcomeFor(5, 7, 12), "miss");
});

test("boost keeps the higher die, snag the lower", () => {
  const seq = [0.1, 0.9];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  assert.equal(rollCheck({ modifier: 0, difficulty: 12, edge: "boost", rng }).kept, 19);
  i = 0;
  assert.equal(rollCheck({ modifier: 0, difficulty: 12, edge: "snag", rng }).kept, 3);
});

test("draft validation catches missing choices", () => {
  const errors = validateDraft({ name: "", pronouns: "", look: "", drive: "", origin: "uplift", variant: "", calling: "nope", background: "scrapper", stats });
  assert.ok(errors.length >= 3);
  assert.deepEqual(validateDraft({ name: "Kestrel", pronouns: "she/her", look: "", drive: "", origin: "uplift", variant: "corvid", calling: "ghost", background: "scrapper", stats }), []);
});

test("table codes", () => {
  const code = makeTableCode();
  assert.match(code, /^[A-HJ-NP-Z]{4}$/);
  assert.equal(normalizeCode(" ab-cd9e"), "ABCD");
  assert.equal(nearestDifficulty(13), 12);
  assert.equal(nearestDifficulty(19), 20);
});

test("content is internally consistent", () => {
  const skillKeys = new Set(SKILLS.map((s) => s.key));
  for (const o of ORIGINS) assert.ok(skillKeys.has(o.skill), o.key);
  for (const c of CALLINGS) for (const s of c.skills) assert.ok(skillKeys.has(s), c.key);
  for (const b of BACKGROUNDS) assert.ok(skillKeys.has(b.skill), b.key);
});

test("sanitizeBeat drops unknown characters and clamps numbers", () => {
  const beat = sanitizeBeat(
    {
      narration: "Hi",
      checks: [
        { characterId: "a", skill: "HACK", difficulty: 15, edge: "boost", reason: "door" },
        { characterId: "a", skill: "talk", difficulty: 12, edge: "none", reason: "dup" },
        { characterId: "zzz", skill: "talk", difficulty: 12, edge: "none", reason: "x" },
        { characterId: "b", skill: "juggling", difficulty: 12, edge: "none", reason: "x" },
      ],
      whispers: [{ characterId: "b", text: "psst" }, { characterId: "q", text: "no" }],
      effects: [{ characterId: "a", vigor: -40, charge: 0, note: "ow" }],
      mode: "combat",
      scene: "advance",
      prompt: "",
      summary: "s",
    },
    ["a", "b"],
  );
  assert.equal(beat.checks.length, 1);
  assert.equal(beat.checks[0].skill, "hack");
  assert.equal(beat.checks[0].difficulty, 16);
  assert.equal(beat.whispers.length, 1);
  assert.equal(beat.effects[0].vigor, -10);
  assert.equal(beat.scene, "stay"); // can't advance with dice owed
  assert.equal(beat.prompt, "What do you do?");
});

test("backup narrator: safe moves just happen, risky ones roll, help gives boost", () => {
  const base = {
    phase: "actions" as const, beat: 1, sceneBeats: 0, mode: "explore" as const, summary: "",
    adventure: ADVENTURES[0], sceneIndex: 0, recentLog: [], rolls: [],
    party: [
      { characterId: "a", name: "Kestrel", pronouns: "", player: "", summary: "", vigor: 10, vigorMax: 10, charge: 3, chargeMax: 3 },
      { characterId: "b", name: "Moss", pronouns: "", player: "", summary: "", vigor: 10, vigorMax: 10, charge: 3, chargeMax: 3 },
    ],
  };
  const dive = ADVENTURES[0].scenes[0].options[0];
  const ask = ADVENTURES[0].scenes[0].options[2];
  const first = backupBeat({
    ...base,
    actions: [
      { characterId: "a", name: "Kestrel", text: dive.text, kind: "option", skill: dive.skill, risky: dive.risky, stakes: dive.stakes },
      { characterId: "b", name: "Moss", text: "I help Kestrel.", kind: "help", targetId: "a" },
    ],
  });
  assert.equal(first.checks.length, 1);
  assert.equal(first.checks[0].skill, "endure");
  assert.equal(first.checks[0].edge, "boost");
  assert.equal(first.checks[0].stakes, dive.stakes);
  assert.equal(first.narration, ""); // the action line already says who helps whom

  const safe = backupBeat({ ...base, actions: [{ characterId: "a", name: "Kestrel", text: ask.text, kind: "option", skill: ask.skill, risky: false, done: ask.done }] });
  assert.equal(safe.checks.length, 0);
  assert.match(safe.narration, /Halcyon-black boat/);

  const out = backupBeat({
    ...base, phase: "outcome", sceneBeats: 2, actions: [],
    rolls: [{ characterId: "a", name: "Kestrel", skill: "endure", difficulty: 12, reason: "Dive in after the sailors", stakes: "The current drags you under.", total: 4, outcome: "miss" }],
  });
  assert.equal(out.scene, "advance");
  assert.equal(out.effects[0].vigor, -2);
  assert.equal(out.effects[0].note, "The current drags you under");
  assert.doesNotMatch(out.narration, /\d+ vs \d+/);
  assert.equal(guessSkill("I hack the terminal"), "hack");
});

test("mechanics never leak into narration", () => {
  assert.equal(stripMechanics("Kestrel fumbles (Glitch!, 4 vs 12)."), "Kestrel fumbles.");
  const beat = sanitizeBeat({ narration: "", checks: [{ characterId: "a", skill: "talk", difficulty: 12, edge: "none", reason: "x", stakes: "" }] }, ["a"]);
  assert.equal(beat.narration, "");
  assert.equal(beat.checks[0].stakes, "If it goes wrong, things get worse.");
});

test("pregens and calling defaults build valid characters", () => {
  for (const p of PREGENS) {
    const draft = draftFromChoices(p);
    assert.deepEqual(validateDraft(draft), [], p.key);
  }
  for (const c of CALLINGS) assert.ok(isValidArray(CALLING_DEFAULTS[c.key].stats), c.key);
});

# The Wake System — Rules

Wakefield runs on a light d20 system designed for phones, a shared screen, and a Game Master (usually the AI) who handles the bookkeeping. Players should be able to learn it in five minutes. The code implements these rules in `shared/rules.ts`; the data lives in `shared/content.ts`. If this doc and the code disagree, fix one of them.

---

## 1. Characters

A character is built from four choices plus some personality:

| Choice | Gives |
|---|---|
| **Origin** (one of 7 peoples) | +1 to a stat, one trained skill, a signature trait |
| **Calling** (one of 6 roles) | two trained skills, Vigor bonus, two abilities, starting gear |
| **Background** (one of 9 pasts) | one trained skill, one meaningful item |
| **Stat array** | assign +2, +1, +1, 0, −1 to the five stats |
| **Personality** | name, pronouns, look, and a **drive** (what you want) |

### Stats

| Stat | Covers |
|---|---|
| **Grit** | strength, toughness, endurance, intimidation by presence |
| **Edge** | speed, reflexes, aim, stealth, fine control |
| **Wits** | perception, knowledge, reasoning, repair, medicine |
| **Heart** | charm, empathy, willpower, leadership, deception |
| **Sync** | interfacing with machines, networks, the Woken, and the Deep |

Stats range from −1 to +3. The origin bonus can raise a stat to at most +3.

### Skills

Twelve skills, each tied to a default stat:

| Grit | Edge | Wits | Heart | Sync |
|---|---|---|---|---|
| Brawl | Shoot | Notice | Talk | Hack |
| Endure | Sneak | Patch | Read | Interface |
| | Pilot | Know | | |

- **Trained** skill: +2.
- **Expert** skill (trained from two sources, e.g. origin *and* calling): +4.
- Untrained: +0. Anyone can attempt anything.

The GM may pair a skill with a different stat when the fiction calls for it (e.g. *Heart + Brawl* to win a crowd during a pit fight).

### Vigor, Charge, and Down

- **Vigor** (health) = 8 + (Grit × 2) + calling bonus. Minimum 4.
- **Charge** = 3 for everyone. Spend Charge to use abilities and some origin traits. Regain 1 Charge when a scene ends and all Charge after a real rest.
- At **0 Vigor** you are **Down**: out of the action until someone stabilizes you (*Patch*, Standard) or the scene ends. Then you're back at 1 Vigor with a **Scar** — a lasting mark the GM and you describe together.

---

## 2. Checks

When the outcome is uncertain and something is at stake, the GM calls for a **check**:

> **d20 + stat + skill bonus** vs. a **Difficulty**

| Difficulty | Target |
|---|---|
| Easy | 8 |
| Standard | 12 |
| Hard | 16 |
| Extreme | 20 |

### Outcomes (degrees of success)

| Result | Condition | Meaning |
|---|---|---|
| **Surge** | natural 20, or total ≥ Difficulty + 5 | Full success plus an extra benefit |
| **Success** | total ≥ Difficulty | You do it |
| **Mixed** | total ≥ Difficulty − 4 | You do it, but at a cost, a complication, or only partly |
| **Miss** | anything lower | It doesn't work and the situation gets worse |
| **Glitch** | natural 1 | A Miss with a memorable twist (never a joke at the character's expense) |

Mixed results matter: they keep the story moving forward. A Miss is never "nothing happens."

### Boost and Snag

- **Boost** — roll 2d20, keep the higher. Granted by a strong position, a good plan, help from an ally, or an ability.

A **Mixed** result always costs something: usually 1 Vigor, or a complication the GM names.
- **Snag** — roll 2d20, keep the lower. Imposed by injury, bad position, or hostile conditions.
- Boost and Snag cancel out. They don't stack.

### Helping

On a beat, a character can tap **Help** on a crewmate instead of acting. The helped character gets **Boost** on their check. Helping never needs a roll.

---

## 3. The beat

The game moves in **beats** instead of strict turns. This keeps everyone engaged at once, which matters around a shared screen.

1. **Frame.** The GM narrates the situation on the table screen and ends with a prompt: *"What do you do?"*
2. **Declare.** Every player picks one of three **suggested moves**, types their own, **helps** a crewmate, or **holds back**. Any of these can add an **ability**; its Charge is spent automatically.
3. **Resolve.** When everyone has declared (or the table taps *Resolve*), the GM reads all the actions together and:
   - narrates what happens immediately,
   - calls for **checks** only where failure would be interesting (often one or two per beat, sometimes none), each with its **stakes** stated up front ("If it goes wrong: the current drags you under"),
   - sends **whispers** (private information) to specific players.
4. **Roll.** Players who were called roll on their phones. The dice land big on the table screen.
5. **Outcome.** The GM narrates the results, applies harm and healing, and frames the next beat.

In **combat** the same loop runs, but each beat is one round of chaotic action. Enemies act in the GM's narration; players roll to attack, defend, dodge, and endure. Players roll all the dice: an enemy's danger is the Difficulty of the check, not a roll of its own.

---

## 4. Harm

Damage is called **harm** and comes in fixed amounts:

| Harm | Example |
|---|---|
| 1 | a scrape, a fall, a slap from the tide |
| 2 | fists, light weapons, a drone's taser |
| 3 | blades, pistols, a shell's punch |
| 5 | rifles, heavy weapons, a crane falling |
| 8 | catastrophic (explosions, the deep trench) |

- A **Surge** on an attack adds +2 harm, or a special effect.
- **Armor** reduces each hit by its rating (usually 1, rarely 2).
- Healing: *Patch* checks restore Vigor (Success 3, Surge 5). A rest restores all Vigor.

### Enemies

The GM tracks enemies narratively with three numbers:

- **Threat** — the Difficulty to hit or evade them (Easy 8 to Extreme 20).
- **Harm** — what they deal when a player misses against them.
- **Toughness** — how many solid hits they take (1 for a goon, 3 for a lieutenant, 5+ for a boss).

---

## 5. Abilities and traits

Each calling has two abilities; each origin has a signature trait. Most abilities cost **1 Charge**. Full text is in `shared/content.ts`. Players invoke them by mentioning them in their action ("I use *Wall* to take the hit for Kestrel"), and the GM applies the effect.

---

## 6. Advancement

- The crew earns **XP** at milestones: finishing a scene (1 XP), finishing an adventure (3 XP), and great moments of roleplay (1 XP, GM's call).
- At **10 XP**, a character gains a **level**: +2 max Vigor, a new ability (from their calling's list or a cross-calling pick), and on even levels +1 to a stat (max +3).

*(Advancement is tracked in the data model now; the level-up flow is a roadmap item.)*

---

## 7. Design notes

- **Players roll, the GM doesn't.** The phone in your hand is your dice. The table screen shows the drama.
- **Fewer, better rolls.** A roll happens when failure is interesting, and you always know what's at stake before you tap.
- **Choices, not forms.** Three suggested moves each beat keep the game moving; free text is always there for the bold.
- **Fixed numbers over dice soup.** Harm, Difficulty, and Vigor are fixed values the AI GM can reason about reliably.
- **Three-step outcomes** (Success / Mixed / Miss) give the narrator something interesting to do with almost every roll.
- **Everything is fiction-first.** The numbers support the story; they don't replace it.

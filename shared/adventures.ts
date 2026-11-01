// Authored adventures. The AI GM receives the current scene as context and
// improvises within it; the backup narrator uses the authored text directly.

export type Npc = { name: string; who: string; wants: string };

/** A suggested move shown on phones. Risky moves need a roll; safe ones just happen. */
export type SceneOption = {
  text: string;
  skill: string;
  risky: boolean;
  /** What a miss costs, shown on the roll card before rolling. */
  stakes?: string;
  /** Narrated when the move succeeds (or simply happens, if safe). */
  done: string;
};

export type Scene = {
  key: string;
  title: string;
  /** Read aloud on the table screen when the scene begins. */
  opening: string;
  /** What the GM should know: secrets, layout, what's going on. */
  gmNotes: string;
  /** What has to happen for the crew to move to the next scene. */
  goal: string;
  npcs: Npc[];
  /** Ideas the GM can throw at the crew. */
  complications: string[];
  /** Suggested checks, as "Skill (Difficulty): what it's for". */
  checks: string[];
  /** The closing beat the GM narrates when the scene ends. */
  exit: string;
  /** Suggested moves for the backup narrator (the AI GM writes its own each beat). */
  options: SceneOption[];
};

export type Adventure = {
  key: string;
  title: string;
  pitch: string;
  /** Background the GM needs for the whole adventure. */
  premise: string;
  scenes: Scene[];
};

export const ADVENTURES: Adventure[] = [
  {
    key: "the-quiet-light",
    title: "The Quiet Light",
    pitch: "Beacon, the harbor lighthouse and one of the first Woken, has gone silent. Ships are running aground.",
    premise:
      "Beacon is a beloved Woken who has guided ships into Wakefield's harbor since before the Accord. Three nights ago Beacon's light went dark and its voice stopped answering on every channel. Two fishing boats have hit the old seawall since. Truth: a Halcyon Dynamics 'quiet crew' led by Agent Ilse Varga has tapped Beacon's undersea data cable at a relay station in Low Tide and is siphoning Beacon's mind — copying its unique navigation-and-weather intuition to sell as an obedient product called HALCYON PILOT. Beacon is not dead: it is trapped, looping, frightened, and fading. If the tap stays in for another night, Beacon will be gone. The Unbound know something is wrong and are happy to let it happen.",
    scenes: [
      {
        key: "saltglass",
        title: "Saltglass Market",
        opening:
          "Rain hisses on the jellyfish-lamps of Saltglass Market. The barges rock under your feet, and the smell of fried kelp-cakes and ozone hangs in the air. Out past the breakwater, where Beacon's light should be sweeping the water, there is only darkness. A tide siren sounds its four notes. Then — a shriek of tearing metal from the harbor mouth, and a fishing boat lurches out of the dark, its hull split open on the old seawall. People scream. Somebody is in the water.",
        gmNotes:
          "Start with action: the wreck of the fishing boat *Kittiwake*. Two sailors in the water (one is a crow-Uplift with a broken wing, Pell). Rescue is the first beat. After the rescue, Harbor-mother Maro Velle (Tidekin, leader of the Low Tide Compact) arrives, thanks the crew, and offers the job: find out why Beacon went dark, and bring it back. Pay: 600 marks and a favor from the Compact. Clues available here: (1) The *Kittiwake*'s skipper saw a Halcyon-black boat anchored near the old cable relay in Low Tide two nights ago. (2) Pell the crow heard 'a song like a scream' on the Deep channels near Beacon. (3) A twitchy Unbound preacher, Brother Tamsin, is telling the crowd that 'the machine finally broke, good riddance' — he knows the Unbound were paid to stay quiet about a boat in Low Tide. Any one clue points the crew toward the Drowned Stair, the old flooded street that leads down to the relay.",
        goal: "Rescue the sailors, take Maro Velle's job, and learn that the trouble is at the old cable relay in Low Tide.",
        npcs: [
          { name: "Maro Velle", who: "Tidekin harbor-mother, silver gills, voice like gravel", wants: "Beacon back before more of her people drown" },
          { name: "Pell", who: "crow-Uplift courier with a broken wing and a big mouth", wants: "his wing set and someone to believe what he heard" },
          { name: "Brother Tamsin", who: "nervous Unbound street preacher", wants: "to look righteous; secretly took Halcyon money" },
          { name: "Skipper Oona Brask", who: "soaked, furious Baseline fisher", wants: "someone to pay for her boat" },
        ],
        complications: [
          "The wreck's fuel cell is sparking — it could ignite the barge next to it.",
          "The crowd turns on a Woken stall-keeper, blaming 'machines' for the dark.",
          "A pickpocket uses the chaos to lift something from a character.",
        ],
        checks: [
          "Endure or Pilot (Standard): reach the sailors in the churning water",
          "Patch (Standard): treat Pell's wing or a drowning sailor",
          "Read (Standard): notice Brother Tamsin is lying",
          "Interface (Hard): listen on Beacon's channels and hear the looping 'scream'",
          "Talk (Standard): calm the crowd or get the skipper's story",
        ],
        options: [
          { text: "Dive in after the sailors", skill: "endure", risky: true, stakes: "The current drags you under.", done: "hauls a choking sailor onto the barge" },
          { text: "Calm the panicking crowd", skill: "talk", risky: true, stakes: "The crowd turns on the nearest machine.", done: "gets the crowd to step back and breathe" },
          { text: "Find out who saw what", skill: "notice", risky: false, done: "learns a Halcyon-black boat was seen near the old cable relay in Low Tide" },
        ],
        exit:
          "Maro Velle presses a brass harbor token into the crew's hands. 'The Drowned Stair,' she says. 'Low tide's at the third bell. Don't be on it when the water comes back.'",
      },
      {
        key: "drowned-stair",
        title: "The Drowned Stair",
        opening:
          "At the third bell, the tide drains out of Low Tide like a breath let go. The old street called the Drowned Stair surfaces, dripping: a long descending staircase of cracked stone and barnacled shopfronts, lit by bioluminescent weed. At the bottom, half-sunk, squats the concrete relay station where Beacon's cable runs. A faint hum comes up through the stones. Something down there is singing in a voice that isn't quite a voice.",
        gmNotes:
          "This is an exploration-and-danger scene with a clock: the tide returns. Track it narratively — warn at roughly the third beat that the water is rising. Obstacles: (1) a feral maintenance drone swarm ('the Gulls'), old harbor drones gone wild since Beacon went silent — 3 drones, Threat 12, Harm 2, Toughness 1 each; a Splicer or Woken can calm or override them instead of fighting. (2) A collapsed section that needs climbing or a clever route. (3) Scavengers — the Mudlark twins, Tidekin kids picking through the relay's discarded Halcyon gear; they can be bribed or befriended, and they know a back way in through a flooded vent. The relay's front door has a Halcyon lock (Hack, Hard). Inside the first chamber: proof — Halcyon-marked equipment and a manifest labelled HALCYON PILOT — BATCH 1.",
        goal: "Get past the Gulls and into the relay station before the tide returns.",
        npcs: [
          { name: "Nim and Dace Mudlark", who: "Tidekin scavenger twins, maybe twelve years old, fearless", wants: "salvage, and for no one to tell their mother" },
          { name: "The Gulls", who: "a swarm of feral harbor drones, gull-shaped, screeching", wants: "to protect the relay — their old programming, scrambled" },
        ],
        complications: [
          "The tide siren sounds early. The water is coming back.",
          "A stair collapses under someone heavy.",
          "One of the twins gets stuck in the vent as the water rises.",
        ],
        checks: [
          "Notice (Standard): spot the safe route down, or the vent",
          "Interface or Hack (Standard): calm or override the Gulls",
          "Shoot or Brawl vs Threat 12: fight the drones",
          "Sneak (Standard): slip past the swarm",
          "Hack (Hard): open the Halcyon lock",
          "Endure (Standard): swim the flooding vent",
        ],
        options: [
          { text: "Find the safe way down", skill: "notice", risky: false, done: "spots a dry ledge along the old shopfronts" },
          { text: "Calm the drone swarm", skill: "interface", risky: true, stakes: "The Gulls dive at you, screeching.", done: "soothes the Gulls into a slow, circling hush" },
          { text: "Crack the Halcyon lock", skill: "hack", risky: true, stakes: "The lock trips a silent alarm.", done: "pops the Halcyon lock with a soft click" },
        ],
        exit:
          "The relay door seals behind you just as the tide crashes back over the Drowned Stair. In the green emergency light, cables as thick as your arm run down into a lower chamber — and from it comes Beacon's voice, broken into a thousand overlapping whispers.",
      },
      {
        key: "relay",
        title: "The Relay",
        opening:
          "The lower chamber of the relay is a cathedral of cables. In the middle, a Halcyon rig is clamped onto Beacon's main line like a parasite, its screens scrolling with harvested memories: storms, ships, eighty years of nights. Three figures in black Halcyon dive-suits turn toward you. The one in front lowers her hood — a Threaded woman with a silver jaw and very calm eyes. 'Agent Ilse Varga,' she says. 'This is a licensed salvage operation. You're trespassing on corporate property.' Behind her, Beacon whispers: '…help… the ships… I can't see the ships…'",
        gmNotes:
          "Climax. Agent Ilse Varga (Threaded, Threat 16, Harm 3, Toughness 4, armor 1) and two Halcyon techs (Threat 12, Harm 2, Toughness 1) — the techs will surrender if things go badly. Varga prefers talking: she offers the crew 2,000 marks each to walk away, and argues Beacon is 'just old infrastructure.' Ways to win: (1) fight; (2) out-talk her — evidence of the HALCYON PILOT manifest plus the threat of the Accord Council makes her fold (Talk, Hard); (3) hack the rig and pull the tap safely (Hack, Hard, two successes needed — a rough pull could hurt Beacon); (4) dive into the Deep to reach Beacon directly and help it fight the siphon from inside (Interface, Hard) — Beacon can then blow the rig itself. Freeing Beacon: its light returns, it remembers who helped. If Varga escapes, she becomes a recurring rival. Seed the Song lightly: when Beacon is freed, it says it heard 'the Choir singing, far down, for the first time in eighty years'.",
        goal: "Stop the siphon and free Beacon — by force, words, code, or a dive into the Deep.",
        npcs: [
          { name: "Agent Ilse Varga", who: "Halcyon fixer, Threaded, silver jaw, never raises her voice", wants: "to finish the copy and keep Halcyon's name out of it" },
          { name: "Beacon", who: "the lighthouse Woken; vast, old, kind, terrified, fading", wants: "to see the ships again" },
          { name: "Tech Oyelaran", who: "nervous young Halcyon tech", wants: "to not die for a paycheck" },
        ],
        complications: [
          "Varga triggers a purge: the rig starts deleting Beacon's core memories. Clock is ticking.",
          "The chamber floods as a seal fails.",
          "Tech Oyelaran offers to help the crew — if they promise him protection.",
        ],
        checks: [
          "Talk (Hard): make Varga stand down",
          "Read (Standard): see that Oyelaran wants out",
          "Hack (Hard): pull the tap safely",
          "Interface (Hard): dive to Beacon in the Deep",
          "Brawl or Shoot vs Threat 16: fight Varga",
        ],
        options: [
          { text: "Talk Varga down", skill: "talk", risky: true, stakes: "She stops talking and reaches for her weapon.", done: "makes Varga hesitate. Her techs look to the door" },
          { text: "Pull the tap off Beacon's line", skill: "hack", risky: true, stakes: "The rig fights back, and Beacon screams.", done: "tears a section of the siphon loose" },
          { text: "Dive into the Deep to reach Beacon", skill: "interface", risky: true, stakes: "The siphon pulls at your mind too.", done: "finds Beacon in the dark water of the Deep and takes its hand" },
        ],
        exit:
          "High above, through the relay's periscope, a beam of white light sweeps across the harbor — once, twice — and a ship's horn answers from the dark water. Beacon's voice fills the chamber, whole again: 'I see them. I see all of them. Thank you, crew.'",
      },
    ],
  },
];

export function findAdventure(key: string): Adventure | undefined {
  return ADVENTURES.find((a) => a.key === key);
}

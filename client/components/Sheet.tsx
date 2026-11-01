import { BACKGROUNDS, SKILLS, STATS, findCalling, findOrigin } from "../../shared/content";
import { formatModifier } from "../../shared/rules";
import type { CharacterView } from "../../shared/views";
import { Meter, Panel } from "../ui";

export function Sheet({ c }: { c: CharacterView }) {
  const origin = findOrigin(c.origin);
  const variant = origin?.variants?.find((v) => v.key === c.variant);
  const calling = findCalling(c.calling);
  const background = BACKGROUNDS.find((b) => b.key === c.background);
  return (
    <div class="flex flex-col gap-4">
      <Panel>
        <p class="text-3xl font-black leading-tight">{c.name}</p>
        <p class="text-ink-muted">
          {c.pronouns ? `${c.pronouns} · ` : ""}
          {variant ? `${variant.name} ` : ""}
          {origin?.name} {calling?.name} · {background?.name} · Level {c.level} ({c.xp} XP)
        </p>
        <div class="mt-4 flex flex-col gap-2">
          <Meter label="Vigor" tone="vigor" value={c.vigor} max={c.sheet.vigorMax} />
          <Meter label="Charge" tone="charge" value={c.charge} max={c.sheet.chargeMax} />
        </div>
        {c.sheet.armor ? <p class="mt-2 text-sm text-ink-muted">Armor {c.sheet.armor}</p> : null}
      </Panel>

      <div class="grid grid-cols-5 gap-2 text-center">
        {STATS.map((s) => (
          <div key={s.key} class="rounded-xl border border-line bg-surface py-2">
            <p class="text-[10px] uppercase tracking-wider text-ink-muted">{s.name}</p>
            <p class="text-2xl font-black text-accent">{formatModifier(c.sheet.stats[s.key])}</p>
          </div>
        ))}
      </div>

      <Panel title="Skills">
        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
          {SKILLS.map((s) => {
            const bonus = c.sheet.skills[s.key];
            const total = c.sheet.stats[s.stat] + bonus;
            return (
              <div key={s.key} class={bonus > 0 ? "flex justify-between text-ink" : "flex justify-between text-ink-muted"}>
                <span>
                  {s.name}
                  {bonus >= 4 ? " ★★" : bonus >= 2 ? " ★" : ""}
                </span>
                <span class="tabular-nums">{formatModifier(total)}</span>
              </div>
            );
          })}
        </div>
        <p class="mt-2 text-xs text-ink-muted">Roll d20 + the number shown. ★ trained, ★★ expert.</p>
      </Panel>

      <Panel title="Abilities">
        <div class="flex flex-col gap-3 text-sm">
          {origin ? (
            <p>
              <b class="text-accent">{origin.trait.name}</b>
              {origin.trait.cost ? <span class="text-ink-muted"> ({origin.trait.cost} Charge)</span> : null} — {origin.trait.text}
              {variant ? <span class="block text-ink-muted">{variant.name}: {variant.text}</span> : null}
            </p>
          ) : null}
          {calling?.abilities.map((a) => (
            <p key={a.name}>
              <b class="text-accent">{a.name}</b> <span class="text-ink-muted">({a.cost} Charge)</span> — {a.text}
            </p>
          ))}
        </div>
      </Panel>

      <Panel title="Gear">
        <ul class="list-inside list-disc text-sm">
          {calling?.gear.map((g) => <li key={g}>{g}</li>)}
          {background ? <li>{background.item}</li> : null}
        </ul>
      </Panel>

      {c.look || c.drive || c.scars ? (
        <Panel title="Who they are">
          {c.look ? <p class="text-sm">{c.look}</p> : null}
          {c.drive ? <p class="mt-2 text-sm italic">Drive: “{c.drive}”</p> : null}
          {c.scars ? <p class="mt-2 text-sm text-danger">Scars: {c.scars}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}

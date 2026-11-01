import { BACKGROUNDS, SKILLS, STATS, findCalling, findOrigin } from "../../shared/content";
import { formatModifier } from "../../shared/rules";
import type { CharacterView } from "../../shared/views";
import { Label, Meter, cx } from "../ui";

function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class="flex flex-col gap-3 border-t border-line pt-4">
      <Label>{title}</Label>
      {children}
    </section>
  );
}

export function Sheet({ c }: { c: CharacterView }) {
  const origin = findOrigin(c.origin);
  const variant = origin?.variants?.find((v) => v.key === c.variant);
  const calling = findCalling(c.calling);
  const background = BACKGROUNDS.find((b) => b.key === c.background);
  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <p class="text-3xl uppercase tracking-[0.1em] text-ink">{c.name}</p>
        <p class="text-[11px] uppercase tracking-[0.15em] text-ink-muted">
          {c.pronouns ? `${c.pronouns} · ` : ""}
          {variant ? `${variant.name} ` : ""}
          {origin?.name} · {calling?.name} · {background?.name} · lv{c.level} · {c.xp}xp
          {c.sheet.armor ? ` · armor ${c.sheet.armor}` : ""}
        </p>
        <Meter label="vig" tone="vigor" value={c.vigor} max={c.sheet.vigorMax} />
        <Meter label="chg" tone="charge" value={c.charge} max={c.sheet.chargeMax} />
      </div>

      <div class="grid grid-cols-5 border-y border-line">
        {STATS.map((s, i) => (
          <div key={s.key} class={cx("py-3 text-center", i > 0 && "border-l border-line")}>
            <p class="text-[10px] uppercase tracking-[0.15em] text-ink-muted">{s.name}</p>
            <p class="mt-1 text-xl text-accent">{formatModifier(c.sheet.stats[s.key])}</p>
          </div>
        ))}
      </div>

      <Section title="Skills · d20 + value">
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {SKILLS.map((s) => {
            const bonus = c.sheet.skills[s.key];
            const total = c.sheet.stats[s.stat] + bonus;
            return (
              <div key={s.key} class={cx("flex justify-between", bonus > 0 ? "text-ink" : "text-ink-muted")}>
                <span>
                  {s.name}
                  <span class="text-accent">{bonus >= 4 ? " ▪▪" : bonus >= 2 ? " ▪" : ""}</span>
                </span>
                <span class="tabular-nums">{formatModifier(total)}</span>
              </div>
            );
          })}
        </div>
        <p class="text-[10px] uppercase tracking-[0.15em] text-ink-muted">▪ trained · ▪▪ expert</p>
      </Section>

      <Section title="Abilities">
        <div class="wf-read flex flex-col gap-3 text-sm text-ink-muted">
          {origin ? (
            <p>
              <span class="font-medium text-ink">{origin.trait.name}</span>
              {origin.trait.cost ? <span class="text-accent"> [{origin.trait.cost}]</span> : null} — {origin.trait.text}
              {variant ? <span class="block">{variant.name}: {variant.text}</span> : null}
            </p>
          ) : null}
          {calling?.abilities.map((a) => (
            <p key={a.name}>
              <span class="font-medium text-ink">{a.name}</span> <span class="text-accent">[{a.cost}]</span> — {a.text}
            </p>
          ))}
        </div>
      </Section>

      <Section title="Gear">
        <ul class="flex flex-col gap-1 text-sm text-ink">
          {calling?.gear.map((g) => (
            <li key={g}>
              <span class="text-ink-muted">- </span>
              {g}
            </li>
          ))}
          {background ? (
            <li>
              <span class="text-ink-muted">- </span>
              {background.item}
            </li>
          ) : null}
        </ul>
      </Section>

      {c.look || c.drive || c.scars ? (
        <Section title="Profile">
          <div class="wf-read flex flex-col gap-2 text-sm">
            {c.look ? <p class="text-ink">{c.look}</p> : null}
            {c.drive ? <p class="text-ink-muted">Drive: {c.drive}</p> : null}
            {c.scars ? <p class="text-danger">Scars: {c.scars}</p> : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

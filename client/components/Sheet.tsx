import type { ComponentChildren } from "preact";

import { BACKGROUNDS, SKILLS, STATS, findCalling, findOrigin } from "../../shared/content";
import { formatModifier } from "../../shared/rules";
import type { CharacterView } from "../../shared/views";
import { Label, Pips, VigorBar, cx } from "../ui";

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="flex flex-col gap-3 border-t border-line pt-4">
      <Label>{title}</Label>
      {children}
    </section>
  );
}

/** Character sheet. `compact` drops the name/Vigor header when the screen already shows it. */
export function Sheet({ c, compact }: { c: CharacterView; compact?: boolean }) {
  const origin = findOrigin(c.origin);
  const variant = origin?.variants?.find((v) => v.key === c.variant);
  const calling = findCalling(c.calling);
  const background = BACKGROUNDS.find((b) => b.key === c.background);
  return (
    <div class="flex flex-col gap-6">
      {compact ? null : (
        <div class="flex flex-col gap-3">
          <div class="flex items-baseline justify-between gap-3">
            <p class="text-3xl text-ink">{c.name}</p>
            <Pips value={c.charge} max={c.sheet.chargeMax} title={`Charge ${c.charge} of ${c.sheet.chargeMax}`} />
          </div>
          <p class="wf-read text-sm text-ink-muted">
            {c.pronouns ? `${c.pronouns} · ` : ""}
            {variant ? `${variant.name} ` : ""}
            {origin?.name} {calling?.name?.toLowerCase()} · level {c.level}
            {c.xp ? ` · ${c.xp} XP` : ""}
          </p>
          <VigorBar value={c.vigor} max={c.sheet.vigorMax} />
        </div>
      )}

      {c.look || c.drive ? (
        <div class="wf-read flex flex-col gap-1 text-sm">
          {c.look ? <p class="text-ink">{c.look}</p> : null}
          {c.drive ? <p class="text-ink-muted">Wants to {c.drive.charAt(0).toLowerCase() + c.drive.slice(1)}</p> : null}
        </div>
      ) : null}

      <Section title="Abilities">
        <div class="wf-read flex flex-col gap-3 text-sm text-ink-muted">
          {origin ? (
            <p>
              <span class="font-medium text-ink">{origin.trait.name}</span>
              {origin.trait.cost ? <span class="text-accent"> · {origin.trait.cost} Charge</span> : null}. {origin.trait.text}
              {variant ? <span class="block">{variant.text}</span> : null}
            </p>
          ) : null}
          {calling?.abilities.map((a) => (
            <p key={a.name}>
              <span class="font-medium text-ink">{a.name}</span> <span class="text-accent">· {a.cost} Charge</span>. {a.text}
            </p>
          ))}
        </div>
      </Section>

      <Section title="Stats">
        <div class="grid grid-cols-5 border-y border-line">
          {STATS.map((s, i) => (
            <div key={s.key} class={cx("py-3 text-center", i > 0 && "border-l border-line")}>
              <p class="text-[11px] text-ink-muted">{s.name}</p>
              <p class="mt-1 text-xl text-accent">{formatModifier(c.sheet.stats[s.key])}</p>
            </div>
          ))}
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {SKILLS.filter((s) => c.sheet.skills[s.key] > 0).map((s) => (
            <div key={s.key} class="flex justify-between text-ink">
              <span>
                {s.name}
                {c.sheet.skills[s.key] >= 4 ? <span class="text-accent"> · expert</span> : null}
              </span>
              <span class="tabular-nums">{formatModifier(c.sheet.stats[s.stat] + c.sheet.skills[s.key])}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Gear">
        <ul class="flex flex-col gap-1 text-sm text-ink">
          {[...(calling?.gear ?? []), ...(background ? [background.item] : [])].map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </Section>

      {c.scars ? <p class="text-sm text-danger">Scars: {c.scars}</p> : null}
    </div>
  );
}

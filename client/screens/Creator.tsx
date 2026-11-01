import { useMemo, useState } from "preact/hooks";
import { navigate, useMutation } from "@spacefast/zero/client";

import { BACKGROUNDS, CALLINGS, DRIVES, ORIGINS, SKILLS, STAT_ARRAY, STATS, findBackground, findCalling, findOrigin, statName, type StatKey } from "../../shared/content";
import { deriveSheet, emptyStats, formatModifier, validateDraft, type CharacterDraft, type Stats } from "../../shared/rules";
import { Btn, ErrorNote, Label, Page, TopBar, cx, useAsync } from "../ui";

const STEPS = ["Origin", "Calling", "Background", "Stats", "Details", "Review"] as const;

function Choice({ selected, onClick, title, subtitle, children }: { selected: boolean; onClick: () => void; title: string; subtitle?: string; children?: preact.ComponentChildren }) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={cx(
        "w-full border px-4 py-3 text-left transition-colors",
        selected ? "border-accent" : "border-line hover:border-ink-muted",
      )}
    >
      <p class={cx("uppercase tracking-[0.15em]", selected ? "text-accent" : "text-ink")}>
        {title}
        {selected ? <span class="float-right text-xs">[x]</span> : null}
      </p>
      {subtitle ? <p class="wf-read mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      {selected && children ? <div class="wf-read mt-3 space-y-2 border-t border-line pt-3 text-sm text-ink">{children}</div> : null}
    </button>
  );
}

const skillName = (key: string) => SKILLS.find((s) => s.key === key)?.name ?? key;

/** Default assignment: the array in stat order. */
function defaultStats(): Stats {
  const s = emptyStats();
  STATS.forEach((stat, i) => (s[stat.key] = STAT_ARRAY[i]));
  return s;
}

function StatAssigner({ stats, onChange, bonus }: { stats: Stats; onChange: (s: Stats) => void; bonus?: StatKey }) {
  // Tap a stat, then tap another to swap their values.
  const [picked, setPicked] = useState<StatKey | null>(null);
  return (
    <div class="flex flex-col gap-2">
      <p class="text-xs text-ink-muted">Tap two stats to swap values. Array: +2 +1 +1 0 −1.</p>
      {STATS.map((s) => {
        const base = stats[s.key];
        const final = Math.min(3, base + (bonus === s.key ? 1 : 0));
        return (
          <button
            type="button"
            key={s.key}
            onClick={() => {
              if (!picked) return setPicked(s.key);
              if (picked === s.key) return setPicked(null);
              onChange({ ...stats, [picked]: stats[s.key], [s.key]: stats[picked] });
              setPicked(null);
            }}
            class={cx(
              "flex items-center justify-between border px-4 py-3 text-left transition-colors",
              picked === s.key ? "border-accent" : "border-line",
            )}
          >
            <div>
              <p class="uppercase tracking-[0.15em]">{s.name}</p>
              <p class="wf-read text-xs text-ink-muted">{s.blurb}</p>
            </div>
            <div class="text-right">
              <p class="text-2xl tabular-nums text-accent">{formatModifier(final)}</p>
              {bonus === s.key ? <p class="text-[10px] uppercase tracking-[0.15em] text-ink-muted">+1 origin</p> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Creator() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CharacterDraft>({
    name: "",
    pronouns: "",
    look: "",
    drive: "",
    origin: "",
    variant: "",
    calling: "",
    background: "",
    stats: defaultStats(),
  });
  const create = useMutation<[CharacterDraft], string>("createCharacter");
  const { busy, error, run } = useAsync();

  const set = (patch: Partial<CharacterDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const origin = findOrigin(draft.origin);
  const calling = findCalling(draft.calling);
  const background = findBackground(draft.background);
  const sheet = useMemo(
    () => (origin && calling && background ? deriveSheet({ origin: draft.origin, calling: draft.calling, background: draft.background, stats: draft.stats }) : null),
    [draft],
  );

  const canNext = [
    Boolean(origin && (!origin.variants || origin.variants.some((v) => v.key === draft.variant))),
    Boolean(calling),
    Boolean(background),
    true,
    draft.name.trim().length > 0,
    true,
  ][step];

  return (
    <Page>
      <TopBar back="/" title="New character" />
      <ol class="flex gap-1">
        {STEPS.map((s, i) => (
          <li key={s} class="flex-1">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              class={cx("h-[3px] w-full", i <= step ? "bg-accent" : "bg-line")}
              aria-label={s}
            />
          </li>
        ))}
      </ol>
      <h2 class="text-xl uppercase tracking-[0.2em]">
        <span class="text-ink-muted">{String(step + 1).padStart(2, "0")}/</span> {STEPS[step]}
      </h2>

      {step === 0 ? (
        <div class="flex flex-col gap-2">
          <p class="wf-read text-sm text-ink-muted">Who are your people? Every origin is a person under the Accord. On paper, at least.</p>
          {ORIGINS.map((o) => (
            <Choice key={o.key} selected={draft.origin === o.key} onClick={() => set({ origin: o.key, variant: o.variants ? draft.variant : "" })} title={o.name} subtitle={o.tagline}>
              <p class="text-ink-muted">{o.description}</p>
              <p>
                <b>+1 {statName(o.statBonus)}</b> · trained in <b>{skillName(o.skill)}</b>
              </p>
              <p>
                <b class="text-accent">{o.trait.name}.</b> {o.trait.text}
              </p>
              {o.variants ? (
                <div class="grid grid-cols-3 gap-2 pt-1">
                  {o.variants.map((v) => (
                    <span
                      key={v.key}
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        set({ variant: v.key });
                      }}
                      class={cx("border px-2 py-2 text-center text-xs uppercase tracking-[0.15em]", draft.variant === v.key ? "border-accent bg-accent text-canvas" : "border-line")}
                    >
                      {v.name}
                    </span>
                  ))}
                </div>
              ) : null}
              {o.variants && draft.variant ? <p class="text-ink-muted">{o.variants.find((v) => v.key === draft.variant)?.text}</p> : null}
            </Choice>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div class="flex flex-col gap-2">
          <p class="wf-read text-sm text-ink-muted">What do you do for the crew?</p>
          {CALLINGS.map((c) => (
            <Choice key={c.key} selected={draft.calling === c.key} onClick={() => set({ calling: c.key })} title={c.name} subtitle={c.tagline}>
              <p>
                Trained in <b>{skillName(c.skills[0])}</b> and <b>{skillName(c.skills[1])}</b> · best with <b>{statName(c.primary)}</b>
              </p>
              {c.abilities.map((a) => (
                <p key={a.name}>
                  <b class="text-accent">{a.name}</b> <span class="text-ink-muted">({a.cost} Charge)</span> — {a.text}
                </p>
              ))}
              <p class="text-ink-muted">Gear: {c.gear.join(", ")}</p>
            </Choice>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div class="flex flex-col gap-2">
          <p class="wf-read text-sm text-ink-muted">What were you before the crew?</p>
          {BACKGROUNDS.map((b) => (
            <Choice key={b.key} selected={draft.background === b.key} onClick={() => set({ background: b.key })} title={b.name} subtitle={b.blurb}>
              <p>
                Trained in <b>{skillName(b.skill)}</b> · carries <b>{b.item}</b>
              </p>
            </Choice>
          ))}
        </div>
      ) : null}

      {step === 3 ? (
        <>
          <StatAssigner stats={draft.stats} onChange={(stats) => set({ stats })} bonus={origin?.statBonus} />
          {calling ? (
            <p class="text-sm text-ink-muted">
              {calling.name}s lean on <span class="text-accent">{statName(calling.primary)}</span>.
            </p>
          ) : null}
        </>
      ) : null}

      {step === 4 ? (
        <div class="flex flex-col gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">// Name</span>
            <input
              class="w-full border border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent"
              value={draft.name}
              maxLength={40}
              placeholder="Kestrel, Unit 9, Marrow-of-Spores…"
              onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">// Pronouns</span>
            <input
              class="w-full border border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent"
              value={draft.pronouns}
              maxLength={30}
              placeholder="she/her, he/him, they/them, it/its…"
              onInput={(e) => set({ pronouns: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">// Look — one or two vivid details</span>
            <textarea
              class="w-full border border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent"
              rows={3}
              maxLength={400}
              value={draft.look}
              placeholder="Chipped porcelain shell, a fisherman's sweater, one eye that glows when they lie."
              onInput={(e) => set({ look: (e.target as HTMLTextAreaElement).value })}
            />
          </label>
          <div class="flex flex-col gap-2">
            <span class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">// Drive — what do you want?</span>
            <div class="flex flex-wrap gap-2">
              {DRIVES.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => set({ drive: d })}
                  class={cx("wf-read border px-3 py-1.5 text-xs", draft.drive === d ? "border-accent text-accent" : "border-line text-ink-muted")}
                >
                  {d}
                </button>
              ))}
            </div>
            <input
              class="w-full border border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent"
              value={draft.drive}
              maxLength={200}
              placeholder="…or write your own"
              onInput={(e) => set({ drive: (e.target as HTMLInputElement).value })}
            />
          </div>
        </div>
      ) : null}

      {step === 5 && sheet && origin && calling && background ? (
        <div class="wf-frame flex flex-col gap-4 border border-line p-5">
          <div>
            <p class="text-2xl uppercase tracking-[0.1em]">{draft.name}</p>
            <p class="text-[11px] uppercase tracking-[0.15em] text-ink-muted">
              {draft.pronouns ? `${draft.pronouns} · ` : ""}
              {origin.variants?.find((v) => v.key === draft.variant)?.name ?? ""} {origin.name} · {calling.name} · {background.name}
            </p>
          </div>
          <div class="grid grid-cols-5 border-y border-line text-center">
            {STATS.map((s, i) => (
              <div key={s.key} class={cx("py-2", i > 0 && "border-l border-line")}>
                <p class="text-[10px] uppercase tracking-[0.15em] text-ink-muted">{s.name}</p>
                <p class="text-lg text-accent">{formatModifier(sheet.stats[s.key])}</p>
              </div>
            ))}
          </div>
          <p class="text-xs uppercase tracking-[0.15em] text-ink-muted">
            vigor <span class="text-ink">{sheet.vigorMax}</span> · charge <span class="text-ink">{sheet.chargeMax}</span>
            {sheet.armor ? <> · armor <span class="text-ink">{sheet.armor}</span></> : null}
          </p>
          <p class="text-xs text-ink">
            {SKILLS.filter((s) => sheet.skills[s.key] > 0)
              .map((s) => `${s.name} ${formatModifier(sheet.skills[s.key])}`)
              .join(" · ")}
          </p>
          {draft.look ? <p class="wf-read text-sm text-ink-muted">{draft.look}</p> : null}
          {draft.drive ? <p class="wf-read text-sm text-ink-muted">Drive: {draft.drive}</p> : null}
        </div>
      ) : null}

      <ErrorNote error={error} />
      <div class="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-canvas px-4 py-3">
        {step > 0 ? (
          <Btn tone="ghost" size="lg" onClick={() => setStep(step - 1)}>
            Back
          </Btn>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Btn size="lg" class="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Next
          </Btn>
        ) : (
          <Btn
            size="lg"
            class="flex-1"
            busy={busy}
            disabled={validateDraft(draft).length > 0}
            onClick={() =>
              void run(async () => {
                const id = await create(draft);
                const params = new URLSearchParams(location.search);
                const back = params.get("return");
                navigate(back && back.startsWith("/") ? back : `/characters/${id}`);
              })
            }
          >
            Create {draft.name || "character"}
          </Btn>
        )}
      </div>
    </Page>
  );
}

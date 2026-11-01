import { useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Link, navigate, useLocation, useMutation } from "@spacefast/zero/client";

import { CALLINGS, DRIVES, ORIGINS, PREGENS, SKILLS, findCalling, findOrigin, statName, type Pregen } from "../../shared/content";
import { deriveSheet, draftFromChoices, formatModifier, normalizeCode, validateDraft, type CharacterDraft } from "../../shared/rules";
import { FIELD } from "../design";
import { Btn, ErrorNote, Page, TopBar, cx, useAsync } from "../ui";

const skillName = (key: string) => SKILLS.find((s) => s.key === key)?.name ?? key;

/** Create a character, then (when joining) take a seat and go straight to play. */
function useCreate(joinCode: string) {
  const create = useMutation<[CharacterDraft], string>("createCharacter");
  const join = useMutation<[string, string], string>("joinCampaign");
  const state = useAsync();
  const go = (draft: CharacterDraft) =>
    state.run(async () => {
      const id = await create(draft);
      if (joinCode) {
        await join(joinCode, id);
        navigate(`/play/${joinCode}`);
      } else {
        navigate(`/characters/${id}`);
      }
    });
  return { ...state, go };
}

function describe(origin: string, variant: string, calling: string): string {
  const o = findOrigin(origin);
  const v = o?.variants?.find((x) => x.key === variant);
  return `${v ? `${v.name} ` : ""}${o?.name ?? ""} ${findCalling(calling)?.name.toLowerCase() ?? ""}`.trim();
}

/** One tap to pick, optional rename, then play. */
export function QuickStart({ joinCode = "" }: { joinCode?: string }) {
  const [picked, setPicked] = useState<Pregen | null>(null);
  const [name, setName] = useState("");
  const { busy, error, go } = useCreate(joinCode);
  const customHref = `/characters/new?custom=1${joinCode ? `&join=${joinCode}` : ""}`;

  return (
    <div class="flex flex-col gap-3">
      {PREGENS.map((p) => {
        const on = picked?.key === p.key;
        return (
          <div key={p.key} class={cx("border transition-colors", on ? "border-accent" : "border-line hover:border-ink-muted")}>
            <button
              type="button"
              class="flex w-full flex-col gap-1 px-4 py-3 text-left"
              onClick={() => {
                setPicked(p);
                setName(p.name);
              }}
            >
              <span class="flex items-baseline justify-between gap-3">
                <span class={cx("text-lg", on ? "text-accent" : "text-ink")}>{p.name}</span>
                <span class="text-xs text-ink-muted">{describe(p.origin, p.variant, p.calling)}</span>
              </span>
              <span class="wf-read text-sm text-ink-muted">{p.hook}</span>
            </button>
            {on ? (
              <form
                class="flex flex-col gap-3 border-t border-line px-4 py-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void go(draftFromChoices({ ...p, name: name.trim() || p.name }));
                }}
              >
                <p class="wf-read text-sm text-ink-muted">{p.look}</p>
                <label class="flex flex-col gap-1">
                  <span class="text-xs text-ink-muted">Name (change it if you like)</span>
                  <input id="pregen-name" class={FIELD} value={name} maxLength={40} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
                </label>
                <ErrorNote error={error} />
                <Btn type="submit" size="lg" busy={busy}>
                  {joinCode ? `Play as ${name.trim() || p.name}` : `Create ${name.trim() || p.name}`}
                </Btn>
              </form>
            ) : null}
          </div>
        );
      })}
      <Link to={customHref} class="py-3 text-center text-xs uppercase tracking-[0.2em] text-ink-muted hover:text-accent">
        Build your own
      </Link>
    </div>
  );
}

function Choice({ selected, onClick, title, subtitle, children }: { selected: boolean; onClick: () => void; title: string; subtitle?: string; children?: ComponentChildren }) {
  return (
    <div class={cx("border transition-colors", selected ? "border-accent" : "border-line hover:border-ink-muted")}>
      <button type="button" onClick={onClick} class="flex w-full flex-col gap-1 px-4 py-3 text-left">
        <span class={cx("text-lg", selected ? "text-accent" : "text-ink")}>{title}</span>
        {subtitle ? <span class="wf-read text-sm text-ink-muted">{subtitle}</span> : null}
      </button>
      {selected && children ? <div class="wf-read space-y-2 border-t border-line px-4 py-3 text-sm text-ink">{children}</div> : null}
    </div>
  );
}

const STEPS = ["Who you are", "What you do", "Your name"] as const;

/** Build your own: origin, calling, name. Stats and background come from the calling. */
function Custom({ joinCode }: { joinCode: string }) {
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState("");
  const [variant, setVariant] = useState("");
  const [calling, setCalling] = useState("");
  const [name, setName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [look, setLook] = useState("");
  const [drive, setDrive] = useState("");
  const { busy, error, go } = useCreate(joinCode);

  const o = findOrigin(origin);
  const c = findCalling(calling);
  const draft = useMemo(() => draftFromChoices({ name, pronouns, look, drive, origin, variant, calling }), [name, pronouns, look, drive, origin, variant, calling]);
  const sheet = o && c ? deriveSheet(draft) : null;
  const canNext = [Boolean(o && (!o.variants || o.variants.some((v) => v.key === variant))), Boolean(c), validateDraft(draft).length === 0][step];

  return (
    <div class="flex flex-col gap-5">
      <div class="flex items-baseline justify-between">
        <h2 class="text-2xl text-ink">{STEPS[step]}</h2>
        <span class="text-xs tabular-nums text-ink-muted">
          {step + 1} of {STEPS.length}
        </span>
      </div>

      {step === 0 ? (
        <div class="flex flex-col gap-2">
          {ORIGINS.map((x) => (
            <Choice key={x.key} selected={origin === x.key} onClick={() => (setOrigin(x.key), setVariant(""))} title={x.name} subtitle={x.tagline}>
              <p class="text-ink-muted">{x.description}</p>
              <p>
                <span class="text-accent">{x.trait.name}.</span> {x.trait.text}
              </p>
              {x.variants ? (
                <div class="grid grid-cols-3 gap-2 pt-1">
                  {x.variants.map((v) => (
                    <button
                      type="button"
                      key={v.key}
                      onClick={() => setVariant(v.key)}
                      class={cx("border px-2 py-2 text-center text-sm", variant === v.key ? "border-accent bg-accent text-canvas" : "border-line text-ink")}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </Choice>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div class="flex flex-col gap-2">
          {CALLINGS.map((x) => (
            <Choice key={x.key} selected={calling === x.key} onClick={() => setCalling(x.key)} title={x.name} subtitle={x.tagline}>
              {x.abilities.map((a) => (
                <p key={a.name}>
                  <span class="text-accent">{a.name}.</span> {a.text}
                </p>
              ))}
              <p class="text-ink-muted">
                Good at {skillName(x.skills[0])} and {skillName(x.skills[1])}. Best with {statName(x.primary)}.
              </p>
            </Choice>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div class="flex flex-col gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-muted">Name</span>
            <input id="custom-name" class={FIELD} value={name} maxLength={40} placeholder="Kestrel, Unit 9, Marrow-of-Spores…" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-muted">Pronouns</span>
            <input id="custom-pronouns" class={FIELD} value={pronouns} maxLength={30} placeholder="she/her, he/him, they/them, it/its…" onInput={(e) => setPronouns((e.target as HTMLInputElement).value)} />
          </label>
          <details class="border-t border-line pt-3">
            <summary class="cursor-pointer text-xs text-ink-muted">Add a look and a drive (optional)</summary>
            <div class="mt-3 flex flex-col gap-3">
              <input id="custom-look" class={FIELD} value={look} maxLength={400} placeholder="One vivid detail" onInput={(e) => setLook((e.target as HTMLInputElement).value)} />
              <div class="flex flex-wrap gap-2">
                {DRIVES.map((d) => (
                  <button type="button" key={d} onClick={() => setDrive(d)} class={cx("wf-read border px-3 py-1.5 text-xs", drive === d ? "border-accent text-accent" : "border-line text-ink-muted")}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </details>
          {sheet && o && c ? (
            <div class="wf-frame flex flex-col gap-2 border border-line p-4">
              <p class="text-lg text-ink">{name || "Unnamed"}</p>
              <p class="text-xs text-ink-muted">
                {describe(origin, variant, calling)} · Vigor {sheet.vigorMax} · {c.abilities.map((a) => a.name).join(", ")}
              </p>
              <p class="text-xs text-ink-muted">
                {SKILLS.filter((s) => sheet.skills[s.key] > 0)
                  .map((s) => `${s.name} ${formatModifier(sheet.stats[s.stat] + sheet.skills[s.key])}`)
                  .join(" · ")}
              </p>
            </div>
          ) : null}
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
          <Btn size="lg" class="flex-1" busy={busy} disabled={!canNext} onClick={() => void go(draft)}>
            {joinCode ? `Play as ${name || "…"}` : `Create ${name || "character"}`}
          </Btn>
        )}
      </div>
    </div>
  );
}

export function Creator() {
  const params = new URLSearchParams(useLocation().search);
  const joinCode = normalizeCode(params.get("join") ?? "");
  const custom = params.get("custom") === "1";
  return (
    <Page>
      <TopBar back={joinCode ? `/join/${joinCode}` : "/"} title={custom ? "Build your own" : "Pick a character"} />
      {custom ? <Custom joinCode={joinCode} /> : <QuickStart joinCode={joinCode} />}
    </Page>
  );
}

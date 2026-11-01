import { useEffect, useState } from "preact/hooks";
import { Link, useMutation } from "@spacefast/zero/client";

import { findCalling, findOrigin, findSkill } from "../../shared/content";
import { checkModifier, formatModifier, normalizeCode, type CheckResult } from "../../shared/rules";
import type { PlayerView, SeatView } from "../../shared/views";
import { Sheet } from "../components/Sheet";
import { StoryLog } from "../components/StoryLog";
import { Btn, ErrorNote, Label, Loading, Meter, OutcomeBadge, Page, TopBar, cx, useAsync, useResilientQuery } from "../ui";

type Tab = "play" | "sheet" | "story";

function ActionPanel({ view, seat }: { view: PlayerView; seat: SeatView }) {
  const submit = useMutation<[string, string], void>("submitAction");
  const [text, setText] = useState(view.myAction);
  const { busy, error, run } = useAsync();
  const locked = Boolean(view.myAction);
  const readyCount = view.party.filter((p) => p.ready).length;

  // Reset the draft when a new beat starts.
  useEffect(() => setText(view.myAction), [view.campaign.beat]);

  const origin = findOrigin(seat.character.origin);
  const calling = findCalling(seat.character.calling);
  const abilities = [...(origin && origin.trait.cost > 0 ? [origin.trait] : []), ...(calling?.abilities ?? [])];

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-2">
        <Label>GM</Label>
        <p class="wf-read text-xl text-ink">{view.campaign.prompt}</p>
      </div>
      <div class="flex flex-col gap-2">
        <label for="action">
          <Label>{seat.character.name} · input</Label>
        </label>
        <textarea
          id="action"
          rows={4}
          maxLength={500}
          class="wf-read border border-line bg-transparent px-3 py-3 text-base text-ink outline-none transition-colors focus:border-accent"
          placeholder="Describe your move. Say how and why."
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="flex flex-wrap gap-2">
          {abilities.map((a) => (
            <button
              type="button"
              key={a.name}
              disabled={seat.character.charge < a.cost}
              class="border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.15em] text-ink-muted hover:border-accent hover:text-accent disabled:opacity-30"
              onClick={() => setText((t) => `${t ? `${t.trim()} ` : ""}I use ${a.name}${a.cost ? ` (${a.cost} Charge)` : ""}: `)}
            >
              + {a.name}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={error} />
      <div class="flex gap-2">
        <Btn size="lg" class="flex-1" busy={busy} disabled={!text.trim() || text.trim() === view.myAction} onClick={() => void run(() => submit(view.campaign.code, text))}>
          {locked ? "Update my move" : "Lock it in"}
        </Btn>
        {locked ? (
          <Btn tone="ghost" size="lg" busy={busy} onClick={() => void run(() => submit(view.campaign.code, ""))}>
            Undo
          </Btn>
        ) : null}
      </div>
      <p class="text-center text-[11px] uppercase tracking-[0.2em] text-ink-muted">
        {locked ? <span class="text-accent">locked · </span> : null}
        {readyCount}/{view.party.length} ready
      </p>
    </div>
  );
}

function RollPanel({ seat }: { seat: SeatView }) {
  const roll = useMutation<[string], CheckResult>("rollCheck");
  const { busy, error, run } = useAsync();
  const check = seat.check;
  if (!check) {
    return (
      <p class="border border-line px-4 py-6 text-center text-xs uppercase tracking-[0.2em] text-ink-muted">
        others rolling · watch the table<span class="wf-blink">_</span>
      </p>
    );
  }
  const skill = findSkill(check.skill);
  const mod = checkModifier(seat.character.sheet, check.skill as never);
  if (check.result) {
    const r = check.result;
    return (
      <div class="flex flex-col items-center gap-3 border border-line px-4 py-8 text-center">
        <Label>
          {skill?.name} · dc{check.difficulty}
        </Label>
        <span class="text-7xl font-bold tabular-nums text-ink">{r.total}</span>
        <OutcomeBadge outcome={r.outcome} />
        <p class="text-[11px] uppercase tracking-[0.15em] text-ink-muted">
          d20 {r.dice.join("/")}
          {r.dice.length > 1 ? ` → ${r.kept}` : ""} {formatModifier(r.modifier)}
        </p>
        <p class="pt-2 text-xs text-ink-muted">Look up. The GM narrates next.</p>
      </div>
    );
  }
  return (
    <div class="wf-frame flex flex-col items-center gap-5 border border-line px-5 py-8 text-center">
      <Label class="text-accent">Check required</Label>
      <p class="wf-read text-ink-muted">{check.reason}</p>
      <p class="text-2xl uppercase tracking-[0.15em] text-ink">
        {skill?.name} <span class="text-accent">{formatModifier(mod)}</span>
      </p>
      <p class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
        dc{check.difficulty}
        {check.edge === "boost" ? " · boost: roll 2, keep high" : check.edge === "snag" ? " · snag: roll 2, keep low" : ""}
      </p>
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => roll(check.id))}
        class="mt-2 flex h-40 w-40 items-center justify-center border border-accent text-4xl font-bold uppercase tracking-[0.1em] text-accent transition-colors active:bg-accent active:text-canvas disabled:opacity-50"
      >
        d20
      </button>
      <p class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">tap to roll</p>
    </div>
  );
}

function Header({ seat, code }: { seat: SeatView; code: string }) {
  const adjust = useMutation<[string, string, number, number], void>("adjustCharacter");
  const c = seat.character;
  return (
    <div class="flex flex-col gap-2 border-b border-line pb-4">
      <div class="flex items-baseline justify-between">
        <p class="text-lg uppercase tracking-[0.15em] text-ink">{c.name}</p>
        {c.vigor === 0 ? <span class="text-[11px] uppercase tracking-[0.2em] text-danger">down</span> : null}
      </div>
      <Meter label="vig" tone="vigor" value={c.vigor} max={c.sheet.vigorMax} />
      <div class="flex items-center gap-2">
        <div class="flex-1">
          <Meter label="chg" tone="charge" value={c.charge} max={c.sheet.chargeMax} />
        </div>
        <button
          type="button"
          class="border border-line px-2 text-[11px] text-ink-muted hover:border-accent hover:text-accent disabled:opacity-30"
          disabled={c.charge === 0}
          aria-label="Spend 1 Charge"
          onClick={() => void adjust(code, c.id, 0, -1)}
        >
          −1
        </button>
      </div>
    </div>
  );
}

export function Play({ code: raw }: { code: string }) {
  const code = normalizeCode(raw ?? "");
  const view = useResilientQuery<PlayerView | null>("playerView", code);
  const [tab, setTab] = useState<Tab>("play");

  if (view === undefined) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (view === null) {
    return (
      <Page>
        <TopBar back="/" />
        <p class="py-20 text-center text-xs uppercase tracking-[0.2em] text-ink-muted">No signal at table {code}.</p>
      </Page>
    );
  }
  const { campaign, seat } = view;
  if (!seat) {
    return (
      <Page>
        <TopBar back="/" title={campaign.name} />
        <p class="text-xs text-ink-muted">You're not seated at this table.</p>
        <Link to={`/join/${code}`} class="text-xs uppercase tracking-[0.2em] text-accent">
          choose a character ›
        </Link>
      </Page>
    );
  }

  const myCheckPending = campaign.phase === "rolls" && seat.check && !seat.check.rolled;
  const lastWhisper = view.log.filter((e) => e.kind === "whisper").slice(-1)[0];

  return (
    <Page>
      <TopBar right={<span class="text-sm tracking-[0.4em] text-accent">{campaign.code}</span>} />
      <Header seat={seat} code={code} />

      {tab === "play" ? (
        <div class="flex flex-col gap-6">
          {campaign.phase === "lobby" ? (
            <div class="flex flex-col gap-2 py-6">
              <Label class="text-accent">Connected</Label>
              <p class="text-xs text-ink-muted">
                Waiting for the table to begin {campaign.adventureTitle}<span class="wf-blink">_</span>
              </p>
              <Link to={`/join/${code}`} class="pt-2 text-[11px] uppercase tracking-[0.2em] text-ink-muted hover:text-accent">
                switch character ›
              </Link>
            </div>
          ) : null}
          {campaign.phase === "actions" && !campaign.gmBusy ? <ActionPanel view={view} seat={seat} /> : null}
          {campaign.phase === "rolls" ? <RollPanel seat={seat} /> : null}
          {campaign.gmBusy || campaign.phase === "outcome" ? (
            <p class="border border-line px-4 py-6 text-center text-xs uppercase tracking-[0.2em] text-accent">
              gm transmitting · look up<span class="wf-blink">_</span>
            </p>
          ) : null}
          {campaign.phase === "ended" ? (
            <div class="flex flex-col gap-2 py-6">
              <Label>End of transmission</Label>
              <p class="wf-read text-ink">{campaign.prompt}</p>
              <Link to="/" class="pt-2 text-[11px] uppercase tracking-[0.2em] text-accent">
                home ›
              </Link>
            </div>
          ) : null}
          {/* Private messages from the GM are easy to miss: keep the latest in view. */}
          {lastWhisper ? (
            <div class="border border-dashed border-ink-muted px-4 py-3">
              <p class="text-[10px] uppercase tracking-[0.3em] text-ink-muted">// private channel</p>
              <p class="wf-read mt-1 text-sm text-ink">{lastWhisper.text}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "sheet" ? <Sheet c={seat.character} /> : null}
      {tab === "story" ? <StoryLog log={view.log} /> : null}

      <nav class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas">
        <div class="mx-auto grid max-w-xl grid-cols-3">
          {(["play", "sheet", "story"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              class={cx(
                "relative border-t py-4 text-[11px] uppercase tracking-[0.25em]",
                tab === t ? "-mt-px border-accent text-accent" : "border-transparent text-ink-muted",
              )}
            >
              {t === "play" ? "Play" : t === "sheet" ? "Sheet" : "Story"}
              {t === "play" && myCheckPending && tab !== "play" ? <span class="wf-blink absolute right-5 top-3 text-accent">●</span> : null}
            </button>
          ))}
        </div>
      </nav>
    </Page>
  );
}

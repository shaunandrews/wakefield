import { useEffect, useState } from "preact/hooks";
import { Link, useMutation, useQuery } from "@spacefast/zero/client";

import { findCalling, findOrigin, findSkill } from "../../shared/content";
import { checkModifier, difficultyName, formatModifier, normalizeCode, type CheckResult } from "../../shared/rules";
import type { PlayerView, SeatView } from "../../shared/views";
import { Sheet } from "../components/Sheet";
import { StoryLog } from "../components/StoryLog";
import { Btn, ErrorNote, Loading, Meter, OutcomeBadge, Page, Panel, TopBar, cx, useAsync } from "../ui";

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
    <div class="flex flex-col gap-4">
      <Panel>
        <p class="text-xs uppercase tracking-[0.25em] text-accent">The GM asks</p>
        <p class="mt-1 text-xl font-bold">{view.campaign.prompt}</p>
      </Panel>
      <div class="flex flex-col gap-2">
        <label for="action" class="text-sm text-ink-muted">
          What does {seat.character.name} do?
        </label>
        <textarea
          id="action"
          rows={4}
          maxLength={500}
          class="rounded-2xl border border-line bg-canvas px-4 py-3 text-lg outline-none focus:border-accent"
          placeholder="Describe your move. Be bold — say how and why."
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="flex flex-wrap gap-2">
          {abilities.map((a) => (
            <button
              type="button"
              key={a.name}
              disabled={seat.character.charge < a.cost}
              class="rounded-full border border-line px-3 py-1 text-sm text-ink disabled:opacity-40"
              onClick={() => setText((t) => `${t ? `${t.trim()} ` : ""}I use ${a.name}${a.cost ? ` (${a.cost} Charge)` : ""}: `)}
            >
              ✦ {a.name}
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
      <p class="text-center text-sm text-ink-muted">
        {locked ? "Locked in. " : ""}
        {readyCount}/{view.party.length} ready
      </p>
    </div>
  );
}

function RollPanel({ view, seat }: { view: PlayerView; seat: SeatView }) {
  const roll = useMutation<[string], CheckResult>("rollCheck");
  const { busy, error, run } = useAsync();
  const check = seat.check;
  if (!check) {
    return (
      <Panel>
        <p class="text-lg">The others are rolling. Watch the table!</p>
      </Panel>
    );
  }
  const skill = findSkill(check.skill);
  const mod = checkModifier(seat.character.sheet, check.skill as never);
  if (check.result) {
    const r = check.result;
    return (
      <Panel>
        <p class="text-ink-muted">
          {skill?.name} vs {difficultyName(check.difficulty)} {check.difficulty}
        </p>
        <div class="mt-2 flex items-center gap-3">
          <span class="text-6xl font-black tabular-nums text-accent">{r.total}</span>
          <OutcomeBadge outcome={r.outcome} />
        </div>
        <p class="mt-1 text-sm text-ink-muted">
          Rolled {r.dice.join(" & ")}
          {r.dice.length > 1 ? ` (kept ${r.kept})` : ""} {formatModifier(r.modifier)}
        </p>
        <p class="mt-3">Look up — the GM will narrate what happens.</p>
      </Panel>
    );
  }
  return (
    <div class="flex flex-col items-center gap-4 rounded-3xl border border-accent bg-surface px-5 py-8 text-center shadow-[0_0_40px_-12px] shadow-accent">
      <p class="text-xs uppercase tracking-[0.3em] text-accent">Your roll</p>
      <p class="text-lg">{check.reason}</p>
      <p class="text-3xl font-black">
        {skill?.name} {formatModifier(mod)}
      </p>
      <p class="text-ink-muted">
        vs {difficultyName(check.difficulty)} {check.difficulty}
        {check.edge === "boost" ? " · Boost (roll 2, keep high)" : check.edge === "snag" ? " · Snag (roll 2, keep low)" : ""}
      </p>
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => roll(check.id))}
        class="mt-2 flex h-40 w-40 items-center justify-center rounded-[2.5rem] bg-accent text-5xl font-black text-canvas shadow-[0_0_60px_-8px] shadow-accent transition active:scale-95 disabled:animate-spin"
      >
        d20
      </button>
      <p class="text-sm text-ink-muted">Tap to roll</p>
      <p class="text-xs text-ink-muted">{view.campaign.phase === "rolls" ? "" : ""}</p>
    </div>
  );
}

function Header({ seat, code }: { seat: SeatView; code: string }) {
  const adjust = useMutation<[string, string, number, number], void>("adjustCharacter");
  const c = seat.character;
  return (
    <div class="rounded-2xl border border-line bg-surface p-3">
      <div class="flex items-center justify-between">
        <p class="text-xl font-black">{c.name}</p>
        {c.vigor === 0 ? <span class="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-canvas">DOWN</span> : null}
      </div>
      <div class="mt-2 flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <Meter label="Vigor" tone="vigor" value={c.vigor} max={c.sheet.vigorMax} />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <Meter label="Charge" tone="charge" value={c.charge} max={c.sheet.chargeMax} />
          </div>
          <button
            type="button"
            class="rounded-lg border border-line px-2 text-sm text-ink-muted disabled:opacity-40"
            disabled={c.charge === 0}
            aria-label="Spend 1 Charge"
            onClick={() => void adjust(code, c.id, 0, -1)}
          >
            −1
          </button>
        </div>
      </div>
    </div>
  );
}

export function Play({ code: raw }: { code: string }) {
  const code = normalizeCode(raw ?? "");
  const view = useQuery<PlayerView | null>("playerView", code);
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
        <p class="py-20 text-center text-ink-muted">No table with code {code}.</p>
      </Page>
    );
  }
  const { campaign, seat } = view;
  if (!seat) {
    return (
      <Page>
        <TopBar back="/" title={campaign.name} />
        <Panel>
          <p>You're not seated at this table yet.</p>
          <Link to={`/join/${code}`} class="mt-3 inline-block font-semibold text-accent">
            Choose a character →
          </Link>
        </Panel>
      </Page>
    );
  }

  const myCheckPending = campaign.phase === "rolls" && seat.check && !seat.check.rolled;

  return (
    <Page>
      <TopBar right={<span class="rounded-lg bg-surface px-2 py-1 font-mono text-sm tracking-widest text-accent">{campaign.code}</span>} />
      <Header seat={seat} code={code} />

      {tab === "play" ? (
        <div class="flex flex-col gap-4">
          {campaign.phase === "lobby" ? (
            <Panel>
              <p class="text-xl font-bold">You're in.</p>
              <p class="mt-1 text-ink-muted">Waiting for the table to begin {campaign.adventureTitle}. Look up at the shared screen.</p>
              <Link to={`/join/${code}`} class="mt-3 inline-block text-sm text-accent">
                Switch character
              </Link>
            </Panel>
          ) : null}
          {campaign.phase === "actions" && !campaign.gmBusy ? <ActionPanel view={view} seat={seat} /> : null}
          {campaign.phase === "rolls" ? <RollPanel view={view} seat={seat} /> : null}
          {campaign.gmBusy || campaign.phase === "outcome" ? (
            <Panel>
              <p class="flex items-center gap-3 text-lg">
                <span class="inline-block h-3 w-3 animate-ping rounded-full bg-accent" /> The GM is narrating — look up at the table!
              </p>
            </Panel>
          ) : null}
          {campaign.phase === "ended" ? (
            <Panel>
              <p class="text-xl font-bold">{campaign.prompt}</p>
              <Link to="/" class="mt-3 inline-block text-accent">
                Back home
              </Link>
            </Panel>
          ) : null}
          {/* Private messages from the GM are easy to miss: show the latest here. */}
          {view.log.filter((e) => e.kind === "whisper").slice(-1).map((e) => (
            <div key={e.id} class="rounded-xl border border-dashed border-[#b38cff] bg-[#b38cff]/10 px-4 py-3">
              <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-[#b38cff]">Latest whisper — only you see this</p>
              <p class="mt-1">{e.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "sheet" ? <Sheet c={seat.character} /> : null}
      {tab === "story" ? <StoryLog log={view.log} /> : null}

      <nav class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div class="mx-auto grid max-w-xl grid-cols-3">
          {(["play", "sheet", "story"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              class={cx("relative py-3.5 text-sm font-semibold capitalize", tab === t ? "text-accent" : "text-ink-muted")}
            >
              {t === "play" ? "Play" : t === "sheet" ? "Sheet" : "Story"}
              {t === "play" && myCheckPending && tab !== "play" ? <span class="absolute right-6 top-3 h-2 w-2 rounded-full bg-accent" /> : null}
            </button>
          ))}
        </div>
      </nav>
    </Page>
  );
}

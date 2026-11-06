import { useEffect, useState } from "preact/hooks";
import { Link, useMutation } from "@spacefast/zero/client";

import { abilitiesFor, findSkill } from "../../shared/content";
import { checkModifier, normalizeCode, type CheckResult } from "../../shared/rules";
import type { PlayerView, SeatView } from "../../shared/views";
import { Sheet } from "../components/Sheet";
import { Btn, ErrorNote, Loading, OUTCOME_MEANING, Page, Pips, VigorBar, cx, useAsync, useLiveQuery } from "../ui";

type Tab = "play" | "sheet";
type Move = { kind: "free" | "option" | "help" | "hold"; text?: string; optionIndex?: number; targetId?: string; ability?: string };

function waitingLine(view: PlayerView): string {
  const waiting = view.party.filter((p) => !p.ready).map((p) => (p.isMe ? "you" : p.name));
  if (waiting.length === 0) return "Everyone's in.";
  return `Waiting on ${waiting.join(", ")}`;
}

/** What just happened: the latest line of story, your own consequences, and private messages. */
function Story({ view }: { view: PlayerView }) {
  if (!view.latestStory && view.myEffects.length === 0 && !view.whisper) return null;
  return (
    <div class="flex flex-col gap-3">
      {view.latestStory ? <p class="wf-read border-l border-line pl-3 text-sm leading-relaxed text-ink-muted">{view.latestStory}</p> : null}
      {view.myEffects.map((e) => (
        <p key={e} class="text-sm text-warning">
          {e}
        </p>
      ))}
      {view.whisper ? (
        <div class="border border-dashed border-ink-muted px-3 py-2">
          <p class="text-[11px] text-ink-muted">Only you can see this</p>
          <p class="wf-read mt-1 text-sm text-ink">{view.whisper}</p>
        </div>
      ) : null}
    </div>
  );
}

function ActionPanel({ view, seat }: { view: PlayerView; seat: SeatView }) {
  const submit = useMutation<[string, Move | null], void>("submitAction");
  const [text, setText] = useState("");
  const [ability, setAbility] = useState("");
  const { busy, error, run } = useAsync();
  const locked = Boolean(view.myAction);
  const send = (move: Move | null) => run(() => submit(view.campaign.code, move && ability ? { ...move, ability } : move));

  // Fresh beat, fresh choices.
  useEffect(() => {
    setText("");
    setAbility("");
  }, [view.campaign.beat]);

  const c = seat.character;
  const abilities = abilitiesFor(c.origin, c.calling);
  const others = view.party.filter((p) => !p.isMe);

  if (locked) {
    return (
      <div class="flex flex-col gap-5">
        <Story view={view} />
        <div class="wf-frame flex flex-col gap-2 border border-line px-4 py-4">
          <p class="text-xs text-ink-muted">Your move</p>
          <p class="wf-read text-lg text-ink">{view.myAction}</p>
        </div>
        <ErrorNote error={error} />
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-ink-muted">{waitingLine(view)}</p>
          <Btn tone="ghost" size="sm" busy={busy} onClick={() => void send(null)}>
            Change
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-5">
      <Story view={view} />
      <p class="wf-read text-xl leading-snug text-ink">{view.campaign.prompt}</p>
      <ErrorNote error={error} />

      {view.options.length > 0 ? (
        <div class="flex flex-col gap-2">
          {view.options.map((o, i) => (
            <button
              type="button"
              key={o.text}
              disabled={busy}
              onClick={() => void send({ kind: "option", optionIndex: i })}
              class="flex items-baseline justify-between gap-3 border border-line px-4 py-3.5 text-left transition-colors hover:border-accent active:bg-accent active:text-canvas"
            >
              <span class="wf-read text-base text-ink">{o.text}</span>
              <span class="shrink-0 text-[11px] text-ink-muted">{findSkill(o.skill)?.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div class="flex">
        <input
          id="action"
          class="wf-read min-w-0 flex-1 border border-r-0 border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent"
          placeholder="Or say what you do…"
          maxLength={500}
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) void send({ kind: "free", text });
          }}
        />
        <Btn disabled={!text.trim()} busy={busy} onClick={() => void send({ kind: "free", text })}>
          Lock it in
        </Btn>
      </div>

      <div class="flex flex-wrap gap-2">
        {others.map((p) => (
          <button
            type="button"
            key={p.characterId}
            disabled={busy}
            onClick={() => void send({ kind: "help", targetId: p.characterId })}
            class="border border-line px-3 py-2 text-xs text-ink hover:border-accent"
          >
            Help {p.name}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={() => void send({ kind: "hold" })} class="border border-line px-3 py-2 text-xs text-ink-muted hover:border-ink">
          Hold back
        </button>
      </div>

      {abilities.length > 0 ? (
        <div class="flex flex-col gap-2 border-t border-line pt-4">
          <p class="text-xs text-ink-muted">Add an ability to your move</p>
          <div class="flex flex-wrap gap-2">
            {abilities.map((a) => {
              const on = ability === a.name;
              const affordable = c.charge >= a.cost;
              return (
                <button
                  type="button"
                  key={a.name}
                  disabled={!affordable}
                  title={a.text}
                  onClick={() => setAbility(on ? "" : a.name)}
                  class={cx("border px-3 py-2 text-xs disabled:opacity-40", on ? "border-accent bg-accent text-canvas" : "border-line text-ink hover:border-accent")}
                >
                  {a.name} · {a.cost}
                </button>
              );
            })}
          </div>
          {ability ? <p class="wf-read text-xs text-ink-muted">{abilities.find((a) => a.name === ability)?.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function RollPanel({ seat, view }: { seat: SeatView; view: PlayerView }) {
  const roll = useMutation<[string], CheckResult>("rollCheck");
  const { busy, error, run } = useAsync();
  const check = seat.check;
  if (!check) {
    return <p class="py-10 text-center text-sm text-ink-muted">{view.party.length > 1 ? "The others are rolling. Watch the table." : "Watch the table."}</p>;
  }
  const skill = findSkill(check.skill);
  const mod = checkModifier(seat.character.sheet, check.skill as never);
  if (check.result) {
    const r = check.result;
    const bad = r.outcome === "miss" || r.outcome === "glitch";
    return (
      <div class="flex flex-col items-center gap-3 border border-line px-4 py-10 text-center">
        <span class={cx("text-3xl uppercase tracking-[0.3em]", bad ? "text-danger" : r.outcome === "mixed" ? "text-warning" : "text-accent")}>{r.outcome}</span>
        <p class="wf-read text-ink">{OUTCOME_MEANING[r.outcome]}</p>
        <p class="text-xs text-ink-muted">
          You rolled {r.kept}
          {r.modifier ? `, ${r.modifier > 0 ? "+" : "−"}${Math.abs(r.modifier)} for ${skill?.name}` : ""}
        </p>
        <p class="pt-3 text-sm text-ink-muted">Look up. The story's on the table.</p>
      </div>
    );
  }
  return (
    <div class="wf-frame flex flex-col items-center gap-5 border border-line px-5 py-8 text-center">
      <p class="wf-read text-lg text-ink">{check.reason}</p>
      <p class="text-sm text-ink-muted">
        {skill?.name} {mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`}
        {check.edge === "boost" ? " · with help: roll two, keep the best" : check.edge === "snag" ? " · hurt: roll two, keep the worst" : ""}
      </p>
      {check.stakes ? (
        <p class="wf-read border-l-2 border-danger pl-3 text-left text-sm text-ink">
          <span class="text-ink-muted">If it goes wrong: </span>
          {check.stakes}
        </p>
      ) : null}
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => roll(check.id))}
        class="mt-2 flex h-40 w-40 items-center justify-center border border-accent text-4xl font-bold uppercase tracking-[0.1em] text-accent transition-colors active:bg-accent active:text-canvas disabled:opacity-50"
      >
        d20
      </button>
    </div>
  );
}

function Header({ seat }: { seat: SeatView }) {
  const c = seat.character;
  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-xl text-ink">{c.name}</p>
        <span class="flex items-center gap-2 text-xs text-ink-muted">
          {c.vigor === 0 ? <span class="text-danger">Down</span> : null}
          Charge <Pips value={c.charge} max={c.sheet.chargeMax} />
        </span>
      </div>
      <VigorBar value={c.vigor} max={c.sheet.vigorMax} />
    </div>
  );
}

/** True on headsets (Quest, Vision Pro): offers the 3D room instead of the phone screen. */
function useVrSupport(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
    xr?.isSessionSupported("immersive-vr").then(setOk).catch(() => setOk(false));
  }, []);
  return ok;
}

export function Play({ code: raw }: { code: string }) {
  const code = normalizeCode(raw ?? "");
  const view = useLiveQuery<PlayerView | null>("playerView", [code], 4000);
  const [tab, setTab] = useState<Tab>("play");
  const canVr = useVrSupport();

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
        <p class="py-20 text-center text-sm text-ink-muted">There's no table with code {code}.</p>
        <Link to="/" class="text-center text-xs uppercase tracking-[0.2em] text-accent">
          Home
        </Link>
      </Page>
    );
  }
  const { campaign, seat } = view;
  if (!seat) {
    return (
      <Page>
        <p class="pt-10 text-sm text-ink-muted">You're not at this table yet.</p>
        <Link to={`/join/${code}`} class="text-xs uppercase tracking-[0.2em] text-accent">
          Choose a character ›
        </Link>
      </Page>
    );
  }

  const myCheckPending = campaign.phase === "rolls" && seat.check && !seat.check.rolled;
  const myXp = seat.character.xp;

  return (
    <Page>
      <Header seat={seat} />
      {canVr ? (
        <Link to={`/vr/${code}`} class="border border-accent px-4 py-3 text-center text-xs uppercase tracking-[0.25em] text-accent">
          Enter the VR room
        </Link>
      ) : null}

      {tab === "play" ? (
        <div class="flex flex-col gap-6 border-t border-line pt-5">
          {campaign.phase === "lobby" ? (
            <div class="flex flex-col gap-2 py-6">
              <p class="text-lg text-ink">You're in.</p>
              <p class="text-sm text-ink-muted">
                The game starts when the table begins<span class="wf-blink">_</span>
              </p>
              <Link to={`/join/${code}`} class="pt-3 text-xs text-ink-muted underline hover:text-accent">
                Play someone else
              </Link>
            </div>
          ) : null}
          {campaign.phase === "actions" && !campaign.gmBusy ? <ActionPanel view={view} seat={seat} /> : null}
          {campaign.phase === "rolls" ? <RollPanel seat={seat} view={view} /> : null}
          {campaign.gmBusy || campaign.phase === "outcome" ? (
            <p class="py-10 text-center text-sm text-accent">
              Look up. The story's on the table<span class="wf-blink">_</span>
            </p>
          ) : null}
          {campaign.phase === "ended" ? (
            <div class="flex flex-col gap-3 py-6">
              <p class="text-3xl text-ink">The end.</p>
              <p class="wf-read text-ink-muted">
                {seat.character.name} has {myXp} XP. Thanks for playing {campaign.adventureTitle}.
              </p>
              <Link to="/" class="pt-2 text-xs uppercase tracking-[0.2em] text-accent">
                Home
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "sheet" ? (
        <div class="border-t border-line pt-5">
          <Sheet c={seat.character} compact />
        </div>
      ) : null}

      <nav class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div class="mx-auto grid max-w-xl grid-cols-2">
          {(["play", "sheet"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              class={cx("relative -mt-px border-t py-4 text-xs uppercase tracking-[0.25em]", tab === t ? "border-accent text-accent" : "border-transparent text-ink-muted")}
            >
              {t === "play" ? "Play" : "Sheet"}
              {t === "play" && myCheckPending && tab !== "play" ? <span class="wf-blink absolute right-8 top-3 text-accent">●</span> : null}
            </button>
          ))}
        </div>
      </nav>
    </Page>
  );
}

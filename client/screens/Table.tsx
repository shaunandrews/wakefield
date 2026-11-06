import { useEffect, useRef, useState } from "preact/hooks";
import { authenticatedFetch, Link, useMutation } from "@spacefast/zero/client";

import { findSkill } from "../../shared/content";
import { normalizeCode } from "../../shared/rules";
import type { LogView, SeatView, TableView } from "../../shared/views";
import { QrCode } from "../components/QrCode";
import { StoryLog } from "../components/StoryLog";
import { MOTION } from "../design";
import { Btn, ErrorNote, Loading, Moment, OUTCOME_MEANING, Page, TopBar, VigorBar, cx, useAsync, useLatch, useLiveQuery, useSecondsSince } from "../ui";

// ---------------------------------------------------------------------------
// The GM driver: the table screen asks the server for each beat.

type GmResponse = { ok: true; beat: number; payload: string; signature: string } | { ok: false; error: string };

export function useGmDriver(view: TableView | null | undefined) {
  const code = view?.campaign.code ?? "";
  const begin = useMutation<[string], number>("beginGm");
  const apply = useMutation<[string, number, string, string], { applied: boolean }>("applyGmBeat");
  const backup = useMutation<[string, string], void>("runBackupBeat");
  const release = useMutation<[string], void>("releaseGm");
  const running = useRef(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  async function runGm() {
    if (!code || running.current) return;
    running.current = true;
    setThinking(true);
    setError("");
    try {
      await begin(code);
      let res: GmResponse;
      try {
        const r = await authenticatedFetch("/api/gm/beat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        res = (await r.json()) as GmResponse;
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : "Network error" };
      }
      if (res.ok) await apply(code, res.beat, res.payload, res.signature);
      else await backup(code, res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await release(code).catch(() => undefined);
    } finally {
      running.current = false;
      setThinking(false);
    }
  }

  // Auto-run: when the dice are all in, or when every player has declared.
  const autoKey = useRef("");
  const c = view?.campaign;
  const allReady = Boolean(view && view.seats.length > 0 && view.seats.every((s) => s.ready));
  useEffect(() => {
    if (!c?.isHost || c.gmBusy || running.current) return;
    const key = `${c.beat}:${c.phase}`;
    if (autoKey.current === key) return;
    if (c.phase === "outcome") {
      autoKey.current = key;
      void runGm();
    } else if (c.phase === "actions" && allReady) {
      const timer = setTimeout(() => {
        autoKey.current = key;
        void runGm();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [c?.beat, c?.phase, c?.gmBusy, c?.isHost, allReady]);

  return { runGm, thinking: thinking || Boolean(c?.gmBusy), error };
}

// ---------------------------------------------------------------------------

function joinUrl(code: string) {
  return `${location.origin}/join/${code}`;
}

function Lobby({ view }: { view: TableView }) {
  const start = useMutation<[string], void>("startCampaign");
  const remove = useMutation<[string, string], void>("removeSeat");
  const { busy, error, run } = useAsync();
  const { campaign, seats } = view;
  return (
    <div class="grid flex-1 gap-10 py-6 md:grid-cols-[auto_1fr]">
      <div class="wf-frame flex flex-col items-center gap-6 border border-line px-10 py-8 text-center">
        <div class="bg-white p-2">
          <QrCode value={joinUrl(campaign.code)} size={220} />
        </div>
        <p class="pl-[0.5em] text-7xl font-bold tracking-[0.5em] text-accent">{campaign.code}</p>
        <p class="text-sm text-ink-muted">Scan, or go to {location.host}/join</p>
      </div>
      <div class="flex flex-col gap-8">
        <div class="flex flex-col gap-2">
          <h1 class="text-4xl text-ink">{campaign.name}</h1>
          <p class="wf-read max-w-xl text-ink-muted">{campaign.adventurePitch}</p>
        </div>
        <div class="flex flex-col">
          {seats.length === 0 ? (
            <p class="border-t border-line py-6 text-ink-muted">
              Waiting for the crew<span class="wf-blink">_</span>
            </p>
          ) : null}
          {seats.map((s) => (
            <div key={s.seatId} class="flex items-baseline gap-5 border-t border-line py-4 last:border-b">
              <p class="flex-1 text-2xl text-ink">{s.character.name}</p>
              <p class="text-sm text-ink-muted">{s.handle}</p>
              {campaign.isHost ? (
                <button class="text-xs text-ink-muted hover:text-danger" onClick={() => void run(() => remove(campaign.code, s.seatId))}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <ErrorNote error={error} />
        {campaign.isHost ? (
          <Btn size="xl" busy={busy} disabled={seats.length === 0} onClick={() => void run(() => start(campaign.code))}>
            Begin the adventure
          </Btn>
        ) : null}
      </div>
    </div>
  );
}

function statusOf(seat: SeatView, phase: string): { text: string; cls: string } | null {
  if (seat.character.vigor === 0) return { text: "down", cls: "text-danger" };
  if (phase === "actions") return seat.ready ? { text: "ready", cls: "text-accent" } : { text: "deciding", cls: "text-ink-muted" };
  if (phase === "rolls" && seat.check) return seat.check.rolled ? { text: "rolled", cls: "text-ink-muted" } : { text: "rolling", cls: "text-accent" };
  return null;
}

function CrewRow({ seat, phase }: { seat: SeatView; phase: string }) {
  const c = seat.character;
  const status = statusOf(seat, phase);
  return (
    <div class="flex flex-col gap-2 border-b border-line py-4">
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-lg text-ink">{c.name}</p>
        {status ? <span class={cx("text-xs", status.cls)}>{status.text}</span> : null}
      </div>
      {seat.handle ? <p class="-mt-2 truncate text-xs text-ink-muted">{seat.handle}</p> : null}
      <VigorBar value={c.vigor} max={c.sheet.vigorMax} label={false} />
    </div>
  );
}

/** A big dice moment whenever a new roll lands. */
function DiceMoment({ log }: { log: LogView[] }) {
  const latestRoll = [...log].reverse().find((e) => e.kind === "roll");
  const [shown, dismiss] = useLatch(latestRoll?.seq ?? null, MOTION.diceHoldMs);
  const entry = shown !== null ? log.find((e) => e.seq === shown) : undefined;
  if (!entry?.roll) return null;
  const r = entry.roll;
  const bad = r.outcome === "miss" || r.outcome === "glitch";
  return (
    <Moment onDismiss={dismiss}>
      <p class="text-lg text-ink">
        {entry.who} <span class="text-ink-muted">· {findSkill(r.skill)?.name}</span>
      </p>
      <div class="flex items-center gap-6">
        {r.dice.map((d, i) => (
          <span key={i} class={cx("text-[9rem] font-bold leading-none tabular-nums", r.dice.length > 1 && d !== r.kept ? "text-line" : bad ? "text-danger" : "text-accent")}>
            {d}
          </span>
        ))}
      </div>
      <span class={cx("text-3xl uppercase tracking-[0.4em]", bad ? "text-danger" : r.outcome === "mixed" ? "text-warning" : "text-accent")}>{r.outcome}</span>
      <p class="wf-read text-ink-muted">{OUTCOME_MEANING[r.outcome]}</p>
    </Moment>
  );
}

/** Full-screen title card when the adventure begins and at every new scene. */
function SceneMoment({ view, shown, dismiss }: { view: TableView; shown: number | null; dismiss: () => void }) {
  const c = view.campaign;
  if (shown === null) return null;
  return (
    <Moment onDismiss={dismiss} solid>
      {shown === 0 ? <p class="text-xs uppercase tracking-[0.3em] text-ink-muted">{c.adventureTitle}</p> : null}
      <p class="text-sm text-accent">
        Scene {shown + 1} of {c.sceneCount}
      </p>
      <h2 class="text-5xl uppercase tracking-[0.12em] text-ink">{c.sceneTitle}</h2>
    </Moment>
  );
}

/** The ending: a recap, not a status message. */
function Recap({ view }: { view: TableView }) {
  const { campaign, seats, log } = view;
  const story = campaign.summary
    ? campaign.summary.split(/\n+/).filter(Boolean)
    : log.filter((e) => e.kind === "narration").slice(-1).map((e) => e.text);
  return (
    <div class="wf-scan flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div class="wf-frame flex w-full max-w-3xl flex-col gap-8 border border-line bg-canvas px-10 py-12">
        <div class="flex flex-col gap-2">
          <p class="text-xs uppercase tracking-[0.3em] text-ink-muted">{campaign.adventureTitle}</p>
          <h1 class="text-5xl uppercase tracking-[0.12em] text-ink">The end</h1>
        </div>
        {story.length ? (
          <div class="wf-read flex flex-col gap-2 text-lg leading-relaxed text-ink-muted">
            {story.slice(-6).map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        ) : null}
        <div class="flex flex-col">
          {seats.map((s) => (
            <div key={s.seatId} class="flex items-baseline justify-between gap-4 border-t border-line py-3 last:border-b">
              <span class="text-xl text-ink">{s.character.name}</span>
              <span class="text-sm text-ink-muted">
                {s.handle ? `${s.handle} · ` : ""}
                <span class="text-accent">{s.character.xp} XP</span>
              </span>
            </div>
          ))}
        </div>
        <Link to="/" class="self-start text-xs uppercase tracking-[0.2em] text-accent">
          Home
        </Link>
      </div>
    </div>
  );
}

function HostMenu({ view, gmError }: { view: TableView; gmError: string }) {
  const rest = useMutation<[string], void>("restCrew");
  const end = useMutation<[string], void>("endCampaign");
  const { busy, error, run } = useAsync();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { campaign } = view;
  const notice = gmError || campaign.gmNotice;
  return (
    <details class="relative">
      <summary class="relative cursor-pointer list-none px-2 text-lg text-ink-muted hover:text-ink" aria-label="Table menu">
        ⋯{notice ? <span class="absolute -right-0.5 top-0 h-1.5 w-1.5 bg-warning" /> : null}
      </summary>
      <div class="absolute right-0 top-9 z-40 flex w-72 flex-col gap-2 border border-line bg-canvas p-3">
        {notice ? <p class="border-l-2 border-warning pl-2 text-xs text-ink-muted">{notice}</p> : null}
        <Btn tone="ghost" size="sm" busy={busy} onClick={() => void run(() => rest(campaign.code))}>
          The crew rests
        </Btn>
        {confirmEnd ? (
          <Btn tone="danger" size="sm" busy={busy} onClick={() => void run(() => end(campaign.code))}>
            Yes, end it for everyone
          </Btn>
        ) : (
          <Btn tone="ghost" size="sm" onClick={() => setConfirmEnd(true)}>
            End the game
          </Btn>
        )}
        <ErrorNote error={error} />
      </div>
    </details>
  );
}

/** The footer: what the room is waiting for. Host controls appear only when the game is stuck. */
function Footer({ view, runGm, thinking }: { view: TableView; runGm: () => Promise<void>; thinking: boolean }) {
  const rollForAbsent = useMutation<[string], void>("rollForAbsent");
  const { busy, run } = useAsync();
  const { campaign, seats } = view;
  const elapsed = useSecondsSince(campaign.phaseAt);

  if (thinking || campaign.phase === "outcome") {
    return (
      <p class="text-lg text-accent">
        The story unfolds<span class="wf-blink">_</span>
      </p>
    );
  }

  if (campaign.phase === "rolls") {
    const waiting = seats.filter((s) => s.check && !s.check.rolled).map((s) => s.character.name);
    return (
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-2xl text-ink">Roll on your phones</p>
          <p class="text-sm text-ink-muted">{waiting.length ? `Waiting on ${waiting.join(", ")}` : "All rolled."}</p>
        </div>
        {campaign.isHost && waiting.length && elapsed >= 30 ? (
          <Btn tone="ghost" busy={busy} onClick={() => void run(() => rollForAbsent(campaign.code))}>
            Roll for {waiting.join(", ")}
          </Btn>
        ) : null}
      </div>
    );
  }

  const waiting = seats.filter((s) => !s.ready).map((s) => s.character.name);
  const anyReady = waiting.length < seats.length;
  const stuck = campaign.isHost && ((anyReady && elapsed >= 45) || (!anyReady && elapsed >= 90));
  return (
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="min-w-0 flex-1">
        <p class="wf-read text-2xl text-ink">{campaign.prompt}</p>
        <p class="text-sm text-ink-muted">{waiting.length ? `Waiting on ${waiting.join(", ")}` : "Everyone's in."}</p>
      </div>
      {stuck ? (
        <Btn tone="ghost" busy={thinking} onClick={() => void runGm()}>
          {anyReady ? "Don't wait" : "Move the story on"}
        </Btn>
      ) : null}
    </div>
  );
}

export function Table({ code: raw }: { code: string }) {
  const code = normalizeCode(raw ?? "");
  const view = useLiveQuery<TableView | null>("tableView", [code], 4000);
  const { runGm, thinking, error } = useGmDriver(view);
  // Latched here (not in SceneMoment) so it sees the lobby -> start transition.
  const sceneKey = view && view.campaign.phase !== "lobby" && view.campaign.phase !== "ended" ? view.campaign.sceneIndex : null;
  const [sceneShown, dismissScene] = useLatch(sceneKey, 4500);

  if (view === undefined) {
    return (
      <Page wide>
        <Loading />
      </Page>
    );
  }
  if (view === null) {
    return (
      <Page wide>
        <TopBar back="/" />
        <p class="py-20 text-center text-ink-muted">There's no table with code {code}.</p>
      </Page>
    );
  }

  const { campaign, seats, log } = view;

  if (campaign.phase === "lobby") {
    return (
      <Page wide>
        <TopBar />
        <Lobby view={view} />
      </Page>
    );
  }

  if (campaign.phase === "ended") return <Recap view={view} />;

  return (
    <div class="flex h-dvh flex-col">
      <DiceMoment log={log} />
      <SceneMoment view={view} shown={sceneShown} dismiss={dismissScene} />
      <header class="flex items-center justify-between gap-6 border-b border-line px-6 py-3">
        <p class="truncate text-sm uppercase tracking-[0.2em] text-accent">
          {campaign.sceneTitle}
          {campaign.mode === "combat" ? <span class="text-danger"> · fight</span> : null}
        </p>
        <div class="flex items-center gap-4">
          <span class="text-sm tracking-[0.4em] text-ink-muted">{campaign.code}</span>
          {campaign.isHost ? <HostMenu view={view} gmError={error} /> : null}
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_280px]">
        <div class="min-h-0 overflow-y-auto px-6 py-8 md:px-12">
          <div class="mx-auto max-w-3xl">
            <StoryLog log={log} big />
          </div>
        </div>
        <aside class="min-h-0 overflow-y-auto border-t border-line px-5 md:border-l md:border-t-0">
          {seats.map((s) => (
            <CrewRow key={s.seatId} seat={s} phase={campaign.phase} />
          ))}
        </aside>
      </div>

      <footer class="border-t border-line px-6 py-4">
        <Footer view={view} runGm={runGm} thinking={thinking} />
      </footer>
    </div>
  );
}

import { useEffect, useRef, useState } from "preact/hooks";
import { authenticatedFetch, Link, useMutation, useQuery } from "@spacefast/zero/client";

import { findCalling, findOrigin, findSkill } from "../../shared/content";
import { difficultyName, normalizeCode } from "../../shared/rules";
import type { LogView, SeatView, TableView } from "../../shared/views";
import { QrCode } from "../components/QrCode";
import { StoryLog } from "../components/StoryLog";
import { Btn, ErrorNote, Loading, Meter, OutcomeBadge, Page, TopBar, cx, useAsync, useResilientQuery } from "../ui";

// ---------------------------------------------------------------------------
// The GM driver: the table screen asks the server for each beat.

type GmResponse = { ok: true; beat: number; payload: string; signature: string } | { ok: false; error: string };

function useGmDriver(view: TableView | null | undefined) {
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
    <div class="grid flex-1 gap-6 md:grid-cols-[auto_1fr]">
      <div class="flex flex-col items-center gap-4 rounded-3xl border border-line bg-surface p-6 text-center">
        <p class="text-sm uppercase tracking-[0.3em] text-ink-muted">Join on your phone</p>
        <QrCode value={joinUrl(campaign.code)} size={240} />
        <p class="font-mono text-7xl font-black tracking-[0.25em] text-accent">{campaign.code}</p>
        <p class="text-sm text-ink-muted">
          or go to <span class="text-ink">{location.host}/join</span>
        </p>
      </div>
      <div class="flex flex-col gap-4">
        <div>
          <p class="text-xs uppercase tracking-[0.3em] text-accent">{campaign.adventureTitle}</p>
          <h1 class="text-4xl font-black">{campaign.name}</h1>
        </div>
        <div class="flex flex-col gap-3">
          {seats.length === 0 ? <p class="rounded-2xl border border-dashed border-line p-8 text-center text-ink-muted">Waiting for the crew to arrive…</p> : null}
          {seats.map((s) => (
            <div key={s.seatId} class="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-2xl font-black text-accent">{s.character.name.slice(0, 1)}</div>
              <div class="flex-1">
                <p class="text-xl font-bold">{s.character.name}</p>
                <p class="text-ink-muted">
                  {findOrigin(s.character.origin)?.name} {findCalling(s.character.calling)?.name} · played by {s.handle}
                </p>
              </div>
              {campaign.isHost ? (
                <button class="text-sm text-ink-muted hover:text-danger" onClick={() => void run(() => remove(campaign.code, s.seatId))}>
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

function CrewCard({ seat, phase }: { seat: SeatView; phase: string }) {
  const c = seat.character;
  const down = c.vigor === 0;
  return (
    <div class={cx("rounded-2xl border bg-surface p-3 transition", down ? "border-danger" : seat.ready && phase === "actions" ? "border-accent" : "border-line")}>
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-lg font-bold">{c.name}</p>
          <p class="truncate text-xs text-ink-muted">
            {findOrigin(c.origin)?.name} {findCalling(c.calling)?.name} · {seat.handle}
          </p>
        </div>
        {phase === "actions" ? (
          <span class={cx("rounded-full px-2 py-0.5 text-xs font-bold", seat.ready ? "bg-accent text-canvas" : "bg-canvas text-ink-muted")}>
            {seat.ready ? "Ready" : "Thinking…"}
          </span>
        ) : null}
        {down ? <span class="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-canvas">DOWN</span> : null}
      </div>
      <div class="mt-2 flex flex-col gap-1">
        <Meter tone="vigor" value={c.vigor} max={c.sheet.vigorMax} />
        <Meter tone="charge" value={c.charge} max={c.sheet.chargeMax} />
      </div>
      {seat.check ? (
        <div class="mt-2 rounded-xl bg-canvas px-3 py-2 text-sm">
          <p class="text-ink-muted">
            {findSkill(seat.check.skill)?.name} · {difficultyName(seat.check.difficulty)} {seat.check.difficulty}
            {seat.check.edge !== "none" ? ` · ${seat.check.edge}` : ""}
          </p>
          {seat.check.result ? (
            <div class="mt-1 flex items-center gap-2">
              <span class="text-2xl font-black tabular-nums">{seat.check.result.total}</span>
              <OutcomeBadge outcome={seat.check.result.outcome} />
            </div>
          ) : (
            <p class="mt-1 animate-pulse font-semibold text-accent">Waiting for roll…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A big dice moment whenever a new roll lands. */
function DiceOverlay({ log }: { log: LogView[] }) {
  const lastSeen = useRef<number | null>(null);
  const [shown, setShown] = useState<LogView | null>(null);
  const latestRoll = [...log].reverse().find((e) => e.kind === "roll");
  // Remember the newest roll at mount so old rolls don't replay on load.
  if (lastSeen.current === null) lastSeen.current = latestRoll?.seq ?? 0;
  useEffect(() => {
    if (!latestRoll || lastSeen.current === null) return;
    if (latestRoll.seq > lastSeen.current) {
      lastSeen.current = latestRoll.seq;
      setShown(latestRoll);
      const t = setTimeout(() => setShown(null), 2600);
      return () => clearTimeout(t);
    }
  }, [latestRoll?.seq]);
  if (!shown?.roll) return null;
  const r = shown.roll;
  return (
    <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-3 rounded-3xl border border-accent bg-surface px-16 py-10 shadow-[0_0_80px_-10px] shadow-accent">
        <p class="text-2xl font-bold">{shown.who}</p>
        <p class="text-ink-muted">
          {findSkill(r.skill)?.name} vs {difficultyName(r.difficulty)} {r.difficulty}
        </p>
        <div class="flex items-center gap-4">
          {r.dice.map((d, i) => (
            <div
              key={i}
              class={cx(
                "flex h-28 w-28 items-center justify-center rounded-3xl border-4 text-6xl font-black tabular-nums",
                r.dice.length > 1 && d !== r.kept ? "border-line text-ink-muted opacity-50" : "border-accent text-accent",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <p class="text-xl tabular-nums text-ink-muted">
          {r.kept} {r.modifier >= 0 ? "+" : "−"} {Math.abs(r.modifier)} = <b class="text-4xl text-ink">{r.total}</b>
        </p>
        <div class="scale-150 pt-2">
          <OutcomeBadge outcome={r.outcome} />
        </div>
      </div>
    </div>
  );
}

function HostControls({ view, runGm, thinking }: { view: TableView; runGm: () => Promise<void>; thinking: boolean }) {
  const rollForAbsent = useMutation<[string], void>("rollForAbsent");
  const rest = useMutation<[string], void>("restCrew");
  const end = useMutation<[string], void>("endCampaign");
  const { busy, error, run } = useAsync();
  const { campaign, seats } = view;
  const readyCount = seats.filter((s) => s.ready).length;
  return (
    <div class="flex flex-wrap items-center gap-2">
      {campaign.phase === "actions" ? (
        <Btn size="lg" busy={thinking} onClick={() => void runGm()}>
          {readyCount === 0 ? "GM, keep going" : `Resolve (${readyCount}/${seats.length} ready)`}
        </Btn>
      ) : null}
      {campaign.phase === "outcome" ? (
        <Btn size="lg" busy={thinking} onClick={() => void runGm()}>
          Narrate the outcome
        </Btn>
      ) : null}
      {campaign.phase === "rolls" ? (
        <Btn tone="ghost" busy={busy} onClick={() => void run(() => rollForAbsent(campaign.code))}>
          Roll for anyone missing
        </Btn>
      ) : null}
      <details class="relative">
        <summary class="cursor-pointer list-none rounded-xl border border-line px-3 py-2.5 text-sm text-ink-muted">More</summary>
        <div class="absolute bottom-12 right-0 z-10 flex w-56 flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xl">
          <Btn tone="ghost" size="sm" busy={busy} onClick={() => void run(() => rest(campaign.code))}>
            The crew rests
          </Btn>
          <Btn
            tone="danger"
            size="sm"
            busy={busy}
            onClick={() => {
              if (confirm("End this campaign for everyone?")) void run(() => end(campaign.code));
            }}
          >
            End campaign
          </Btn>
        </div>
      </details>
      <ErrorNote error={error} />
    </div>
  );
}

export function Table({ code: raw }: { code: string }) {
  const code = normalizeCode(raw ?? "");
  const view = useResilientQuery<TableView | null>("tableView", code);
  const { runGm, thinking, error } = useGmDriver(view);

  if (view === undefined) {
    return (
      <Page wide>
        <Loading label="Opening the table…" />
      </Page>
    );
  }
  if (view === null) {
    return (
      <Page wide>
        <TopBar back="/" />
        <p class="py-20 text-center text-ink-muted">No table with code {code}.</p>
      </Page>
    );
  }

  const { campaign, seats, log } = view;

  if (campaign.phase === "lobby") {
    return (
      <Page wide>
        <TopBar right={<span class="text-sm text-ink-muted">Shared screen</span>} />
        <Lobby view={view} />
      </Page>
    );
  }

  return (
    <div class="flex h-dvh flex-col">
      <DiceOverlay log={log} />
      <header class="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div class="flex min-w-0 items-center gap-4">
          <Link to="/" class="text-lg font-black tracking-[0.2em] text-accent">
            WAKEFIELD
          </Link>
          <div class="min-w-0">
            <p class="truncate font-bold">{campaign.name}</p>
            <p class="truncate text-xs text-ink-muted">
              {campaign.adventureTitle} · Scene {Math.min(campaign.sceneIndex + 1, campaign.sceneCount)} of {campaign.sceneCount}: {campaign.sceneTitle}
              {campaign.mode === "combat" ? " · ⚔ Combat" : ""}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="hidden text-xs text-ink-muted sm:inline">Join at {location.host}/join</span>
          <span class="rounded-xl bg-surface px-3 py-1 font-mono text-2xl font-black tracking-[0.2em] text-accent">{campaign.code}</span>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_320px]">
        <div class="min-h-0 overflow-y-auto px-6 py-6 md:px-10">
          <div class="mx-auto max-w-3xl">
            <StoryLog log={log} big />
            {thinking ? (
              <p class="mt-6 flex items-center gap-3 text-lg text-accent">
                <span class="inline-block h-3 w-3 animate-ping rounded-full bg-accent" /> The GM is weaving the next beat…
              </p>
            ) : null}
          </div>
        </div>
        <aside class="min-h-0 overflow-y-auto border-t border-line bg-canvas p-4 md:border-l md:border-t-0">
          <p class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">The crew</p>
          <div class="flex flex-col gap-3">
            {seats.map((s) => (
              <CrewCard key={s.seatId} seat={s} phase={campaign.phase} />
            ))}
          </div>
        </aside>
      </div>

      <footer class="border-t border-line bg-surface px-5 py-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <p class="text-xs uppercase tracking-[0.25em] text-accent">
              {campaign.phase === "rolls" ? "Roll on your phones" : campaign.phase === "ended" ? "The end" : campaign.phase === "outcome" ? "The dice are in" : "Now"}
            </p>
            <p class="text-2xl font-bold">{campaign.prompt}</p>
            {campaign.gmNotice ? <p class="mt-1 text-xs text-warning">{campaign.gmNotice}</p> : null}
            <ErrorNote error={error} />
          </div>
          {campaign.isHost && campaign.phase !== "ended" ? <HostControls view={view} runGm={runGm} thinking={thinking} /> : null}
        </div>
      </footer>
    </div>
  );
}

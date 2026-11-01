import { useEffect, useRef, useState } from "preact/hooks";
import { authenticatedFetch, Link, useMutation, useQuery } from "@spacefast/zero/client";

import { findCalling, findOrigin, findSkill } from "../../shared/content";
import { difficultyName, normalizeCode } from "../../shared/rules";
import type { LogView, SeatView, TableView } from "../../shared/views";
import { QrCode } from "../components/QrCode";
import { StoryLog } from "../components/StoryLog";
import { Btn, ErrorNote, Label, Loading, Logo, Meter, OutcomeBadge, Page, TopBar, cx, useAsync, useResilientQuery } from "../ui";

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
    <div class="grid flex-1 gap-10 py-6 md:grid-cols-[auto_1fr]">
      <div class="wf-frame flex flex-col items-center gap-6 border border-line px-10 py-8 text-center">
        <Label>Scan to join</Label>
        <div class="bg-white p-2">
          <QrCode value={joinUrl(campaign.code)} size={220} />
        </div>
        <p class="pl-[0.5em] text-7xl font-bold tracking-[0.5em] text-accent">{campaign.code}</p>
        <p class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">{location.host}/join</p>
      </div>
      <div class="flex flex-col gap-8">
        <div class="flex flex-col gap-3">
          <Label>{campaign.adventureTitle}</Label>
          <h1 class="text-4xl uppercase tracking-[0.1em]">{campaign.name}</h1>
        </div>
        <div class="flex flex-col">
          <Label class="mb-3">Crew · {seats.length} connected</Label>
          {seats.length === 0 ? (
            <p class="border-t border-line py-6 text-xs uppercase tracking-[0.2em] text-ink-muted">
              awaiting connections<span class="wf-blink">_</span>
            </p>
          ) : null}
          {seats.map((s, i) => (
            <div key={s.seatId} class="flex items-center gap-5 border-t border-line py-4 last:border-b">
              <span class="text-xs tabular-nums text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
              <div class="flex-1">
                <p class="text-xl text-ink">{s.character.name}</p>
                <p class="text-[11px] uppercase tracking-[0.15em] text-ink-muted">
                  {findOrigin(s.character.origin)?.name} · {findCalling(s.character.calling)?.name} · {s.handle}
                </p>
              </div>
              <span class="text-[11px] uppercase tracking-[0.2em] text-accent">online</span>
              {campaign.isHost ? (
                <button class="text-[11px] uppercase tracking-[0.2em] text-ink-muted hover:text-danger" onClick={() => void run(() => remove(campaign.code, s.seatId))}>
                  drop
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

function CrewRow({ seat, phase }: { seat: SeatView; phase: string }) {
  const c = seat.character;
  const down = c.vigor === 0;
  const status = down
    ? { text: "down", cls: "text-danger" }
    : phase === "actions"
      ? seat.ready
        ? { text: "ready", cls: "text-accent" }
        : { text: "…", cls: "text-ink-muted" }
      : null;
  return (
    <div class={cx("flex flex-col gap-2 border-b border-line py-4", down && "opacity-80")}>
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-ink">{c.name}</p>
        {status ? <span class={cx("text-[11px] uppercase tracking-[0.2em]", status.cls)}>{status.text}</span> : null}
      </div>
      <p class="truncate text-[10px] uppercase tracking-[0.15em] text-ink-muted">
        {findCalling(c.calling)?.name} · {seat.handle}
      </p>
      <Meter label="vig" tone="vigor" value={c.vigor} max={c.sheet.vigorMax} />
      <Meter label="chg" tone="charge" value={c.charge} max={c.sheet.chargeMax} />
      {seat.check ? (
        <div class="mt-1 flex items-center justify-between gap-2 border border-line px-3 py-2 text-[11px] uppercase tracking-[0.15em]">
          <span class="text-ink-muted">
            {findSkill(seat.check.skill)?.name} · dc{seat.check.difficulty}
            {seat.check.edge !== "none" ? ` · ${seat.check.edge}` : ""}
          </span>
          {seat.check.result ? (
            <span class="flex items-center gap-2">
              <span class="text-base tabular-nums text-ink">{seat.check.result.total}</span>
              <OutcomeBadge outcome={seat.check.result.outcome} />
            </span>
          ) : (
            <span class="text-accent">
              rolling<span class="wf-blink">_</span>
            </span>
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
  const bad = r.outcome === "miss" || r.outcome === "glitch";
  return (
    <div class="wf-scan pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-canvas/90">
      <div class="wf-frame flex min-w-[360px] flex-col items-center gap-6 border border-line bg-canvas px-14 py-10">
        <Label>
          {shown.who} · {findSkill(r.skill)?.name} · dc{r.difficulty}
        </Label>
        <div class="flex items-center gap-4">
          {r.dice.map((d, i) => (
            <span
              key={i}
              class={cx(
                "text-[9rem] font-bold leading-none tabular-nums",
                r.dice.length > 1 && d !== r.kept ? "text-line" : bad ? "text-danger" : "text-accent",
              )}
            >
              {String(d).padStart(2, "0")}
            </span>
          ))}
        </div>
        <p class="text-sm uppercase tracking-[0.2em] text-ink-muted">
          {r.kept} {r.modifier >= 0 ? "+" : "−"} {Math.abs(r.modifier)} = <span class="text-2xl text-ink">{r.total}</span>
        </p>
        <span class={cx("text-2xl uppercase tracking-[0.4em]", bad ? "text-danger" : r.outcome === "mixed" ? "text-warning" : "text-accent")}>
          {r.outcome}
        </span>
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
          {readyCount === 0 ? "GM, keep going" : `Resolve ${readyCount}/${seats.length}`}
        </Btn>
      ) : null}
      {campaign.phase === "outcome" ? (
        <Btn size="lg" busy={thinking} onClick={() => void runGm()}>
          Narrate the outcome
        </Btn>
      ) : null}
      {campaign.phase === "rolls" ? (
        <Btn tone="ghost" size="lg" busy={busy} onClick={() => void run(() => rollForAbsent(campaign.code))}>
          Roll for anyone missing
        </Btn>
      ) : null}
      <details class="relative">
        <summary class="cursor-pointer list-none border border-line px-4 py-3.5 text-sm text-ink-muted hover:border-ink">⋯</summary>
        <div class="absolute bottom-14 right-0 z-10 flex w-56 flex-col gap-2 border border-line bg-canvas p-3">
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
        <Loading label="Opening table" />
      </Page>
    );
  }
  if (view === null) {
    return (
      <Page wide>
        <TopBar back="/" />
        <p class="py-20 text-center text-xs uppercase tracking-[0.2em] text-ink-muted">No signal at table {code}.</p>
      </Page>
    );
  }

  const { campaign, seats, log } = view;

  if (campaign.phase === "lobby") {
    return (
      <Page wide>
        <TopBar right={<span class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">shared screen</span>} />
        <Lobby view={view} />
      </Page>
    );
  }

  const phaseLabel =
    campaign.phase === "rolls" ? "roll on your phones" : campaign.phase === "ended" ? "end of transmission" : campaign.phase === "outcome" ? "dice are in" : "your move";

  return (
    <div class="flex h-dvh flex-col">
      <DiceOverlay log={log} />
      <header class="flex items-center justify-between gap-6 border-b border-line px-6 py-3">
        <div class="flex min-w-0 items-center gap-6">
          <Logo />
          <p class="truncate text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            {campaign.name} <span class="text-line">/</span> {String(Math.min(campaign.sceneIndex + 1, campaign.sceneCount)).padStart(2, "0")}·
            {String(campaign.sceneCount).padStart(2, "0")} {campaign.sceneTitle}
            {campaign.mode === "combat" ? <span class="text-danger"> / combat</span> : null}
          </p>
        </div>
        <div class="flex items-center gap-4">
          <span class="hidden text-[11px] uppercase tracking-[0.2em] text-ink-muted sm:inline">{location.host}/join</span>
          <span class="border border-line px-3 py-1 text-lg tracking-[0.4em] text-accent">{campaign.code}</span>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_300px]">
        <div class="min-h-0 overflow-y-auto px-6 py-8 md:px-12">
          <div class="mx-auto max-w-3xl">
            <StoryLog log={log} big />
            {thinking ? (
              <p class="mt-8 text-xs uppercase tracking-[0.25em] text-accent">
                gm processing<span class="wf-blink">_</span>
              </p>
            ) : null}
          </div>
        </div>
        <aside class="min-h-0 overflow-y-auto border-t border-line px-5 py-4 md:border-l md:border-t-0">
          <Label>Crew</Label>
          <div class="flex flex-col">
            {seats.map((s) => (
              <CrewRow key={s.seatId} seat={s} phase={campaign.phase} />
            ))}
          </div>
        </aside>
      </div>

      <footer class="border-t border-line px-6 py-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <Label class={campaign.phase === "rolls" ? "text-accent" : ""}>{phaseLabel}</Label>
            <p class="wf-read mt-1 text-2xl text-ink">{campaign.prompt}</p>
            {campaign.gmNotice ? <p class="mt-1 text-[11px] uppercase tracking-[0.15em] text-warning">{campaign.gmNotice}</p> : null}
            <ErrorNote error={error} />
          </div>
          {campaign.isHost && campaign.phase !== "ended" ? <HostControls view={view} runGm={runGm} thinking={thinking} /> : null}
        </div>
      </footer>
    </div>
  );
}

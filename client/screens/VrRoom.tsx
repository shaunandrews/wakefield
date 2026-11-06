import { useEffect, useRef, useState } from "preact/hooks";
import { Link, useMutation } from "@spacefast/zero/client";

import { abilitiesFor } from "../../shared/content";
import { normalizeCode, type CheckResult } from "../../shared/rules";
import type { PlayerView, SeatView, TableView } from "../../shared/views";
import { Room, loadThree, type VrActions } from "../vr/room";
import { useLiveQuery } from "../ui";
import { useNewSim } from "./SimStart";
import { useGmDriver } from "./Table";

type Move = { kind: "option" | "help" | "hold"; optionIndex?: number; targetId?: string; ability?: string };

type XrNavigator = Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean> } };

/** Bots and tests drive the room through this, since there's no DOM to click. */
type VrHooks = {
  state: () => { phase: string; canAct: boolean; locked: boolean; options: string[]; helps: string[]; dieReady: boolean; isHost: boolean; seated: boolean };
  choose: (i: number) => void;
  help: (i: number) => void;
  hold: () => void;
  ability: (i: number) => void;
  throwDie: () => boolean;
  begin: () => void;
  newSim: () => void;
};

export function VrRoom({ code: raw }: { code: string }) {
  // Kept in state so "Watch another" can swap tables without leaving the room (or VR).
  const [code, setCode] = useState(() => normalizeCode(raw ?? ""));
  useEffect(() => setCode(normalizeCode(raw ?? "")), [raw]);
  const table = useLiveQuery<TableView | null>("tableView", [code], 4000);
  const player = useLiveQuery<PlayerView | null>("playerView", [code], 4000);
  const { thinking } = useGmDriver(table?.campaign.isHost ? table : null);
  const submit = useMutation<[string, Move | null], void>("submitAction");
  const rollCheck = useMutation<[string], CheckResult>("rollCheck");
  const start = useMutation<[string], void>("startCampaign");
  const simStep = useMutation<[string], string>("simStep");
  const startSim = useNewSim();

  const host = useRef<HTMLDivElement>(null);
  const room = useRef<Room | null>(null);
  const [ability, setAbility] = useState("");
  const [xr, setXr] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [feed, setFeed] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const isSim = Boolean(table?.campaign.isHost && player && !player.seat && table.seats.some((s) => s.userId.startsWith("bot:")));

  // Latest values for callbacks the room holds onto.
  const live = useRef({ player, ability });
  live.current = { player, ability };

  const send = (move: Move | null) => {
    const a = live.current.ability;
    setAbility("");
    setError("");
    void submit(code, move && a ? { ...move, ability: a } : move).catch((e: Error) => setError(e.message));
  };

  // Errors fade on their own; there's no tap-to-dismiss in a headset.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const actions: VrActions = {
    choose: (i) => send({ kind: "option", optionIndex: i }),
    help: (id) => send({ kind: "help", targetId: id }),
    hold: () => send({ kind: "hold" }),
    change: () => send(null),
    toggleAbility: (name) => setAbility((a) => (a === name ? "" : name)),
    begin: () => void start(code).catch((e: Error) => setError(e.message)),
    roll: async () => {
      const check = live.current.player?.seat?.check;
      if (!check || check.rolled) return null;
      return rollCheck(check.id);
    },
    pause: () => setPaused((p) => !p),
    newSim: () =>
      void startSim()
        .then((next) => {
          history.replaceState(null, "", `/vr/${next}`);
          setFeed([]);
          setPaused(false);
          setCode(next);
        })
        .catch((e: Error) => setError(e.message)),
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Build the room once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const T = await loadThree();
        await document.fonts.ready;
        if (cancelled || !host.current) return;
        const proxy: VrActions = {
          choose: (i) => actionsRef.current.choose(i),
          help: (id) => actionsRef.current.help(id),
          hold: () => actionsRef.current.hold(),
          change: () => actionsRef.current.change(),
          toggleAbility: (n) => actionsRef.current.toggleAbility(n),
          begin: () => actionsRef.current.begin(),
          roll: () => actionsRef.current.roll(),
          pause: () => actionsRef.current.pause(),
          newSim: () => actionsRef.current.newSim(),
        };
        room.current = new Room(T, host.current, proxy);
        setTick((t) => t + 1);
      } catch (e) {
        setError(`Couldn't load the 3D room: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    (navigator as XrNavigator).xr
      ?.isSessionSupported("immersive-vr")
      .then(setXr)
      .catch(() => setXr(false));
    return () => {
      cancelled = true;
      room.current?.dispose();
      room.current = null;
    };
  }, []);

  // Push game state into the room.
  useEffect(() => {
    if (room.current && table && player) room.current.update({ table, player, ability, thinking, error, sim: isSim ? { feed, paused } : null });
  }, [table, player, ability, thinking, error, tick, isSim, feed, paused]);

  // Sim: the bots take turns at a human pace, one move or one roll at a time.
  const phase = table?.campaign.phase;
  useEffect(() => {
    if (!isSim || paused || phase === "ended" || phase === "lobby") return;
    let stopped = false;
    let timer = 0;
    const step = async () => {
      if (stopped) return;
      try {
        const did = await simStep(code);
        if (did && !stopped) setFeed((f) => [...f.slice(-20), did]);
      } catch {
        // The GM is mid-beat or the phase just moved on; try again shortly.
      }
      if (!stopped) timer = window.setTimeout(step, 1800 + Math.random() * 2200);
    };
    timer = window.setTimeout(step, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isSim, paused, phase, code]);

  // Test hooks.
  useEffect(() => {
    const w = window as Window & { wfVR?: VrHooks };
    w.wfVR = {
      state: () => {
        const p = live.current.player;
        const others = p?.party.filter((m) => !m.isMe) ?? [];
        const phase = p?.campaign.phase ?? "";
        const canAct = phase === "actions" && !p?.campaign.gmBusy && Boolean(p?.seat) && !p?.myAction;
        return {
          phase,
          canAct,
          locked: Boolean(p?.myAction),
          options: canAct ? (p?.options ?? []).slice(0, 4).map((o) => o.text) : [],
          helps: canAct ? others.map((m) => m.name) : [],
          dieReady: room.current?.dieReady ?? false,
          isHost: Boolean(p?.campaign.isHost),
          seated: Boolean(p?.seat),
        };
      },
      choose: (i) => actionsRef.current.choose(i),
      help: (i) => {
        const other = live.current.player?.party.filter((m) => !m.isMe)[i];
        if (other) actionsRef.current.help(other.characterId);
      },
      hold: () => actionsRef.current.hold(),
      ability: (i) => {
        const seat = live.current.player?.seat;
        if (seat) actionsRef.current.toggleAbility(abilityName(seat, i));
      },
      throwDie: () => room.current?.autoThrow() ?? false,
      begin: () => actionsRef.current.begin(),
      newSim: () => actionsRef.current.newSim(),
    };
    return () => {
      delete w.wfVR;
    };
  }, []);

  return (
    <div class="fixed inset-0 bg-canvas">
      <div ref={host} class="absolute inset-0" />
      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-5 py-4">
        <Link to={isSim ? "/" : `/play/${code}`} class="pointer-events-auto text-xs uppercase tracking-[0.25em] text-ink-muted hover:text-accent">
          {isSim ? "‹ Home" : "‹ Phone view"}
        </Link>
        {xr ? (
          <button
            type="button"
            onClick={() => void room.current?.enterVR().catch((e: Error) => setError(e.message))}
            class="pointer-events-auto border border-accent px-5 py-3 text-sm uppercase tracking-[0.25em] text-accent hover:bg-accent hover:text-canvas"
          >
            Enter VR
          </button>
        ) : (
          <p class="text-[11px] uppercase tracking-[0.15em] text-ink-muted">{isSim ? "Drag to look around" : "Drag to look · click to choose · drag the die to throw"}</p>
        )}
      </div>
      {error ? <p class="absolute inset-x-0 bottom-0 px-5 py-4 text-sm text-danger">{error}</p> : null}
      {table === null || player === null ? <p class="absolute inset-x-0 top-1/2 text-center text-sm text-ink-muted">There's no table with code {code}.</p> : null}
    </div>
  );
}

function abilityName(seat: SeatView, i: number): string {
  return abilitiesFor(seat.character.origin, seat.character.calling)[i]?.name ?? "";
}

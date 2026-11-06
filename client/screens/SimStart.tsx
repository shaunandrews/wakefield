import { useEffect, useRef, useState } from "preact/hooks";
import { Link, navigate, useMutation } from "@spacefast/zero/client";

import { ADVENTURES } from "../../shared/adventures";
import { Page, TopBar } from "../ui";

/** Creates a table, seats four bots, and starts the adventure. Resolves to the table code. */
export function useNewSim() {
  const create = useMutation<[string, string], string>("createCampaign");
  const addCrew = useMutation<[string, number], number>("addSimCrew");
  const start = useMutation<[string], void>("startCampaign");
  return async () => {
    const code = await create("Sim game", ADVENTURES[0].key);
    await addCrew(code, 4);
    await start(code);
    return code;
  };
}

/** Sets up a table of bots and drops you into the 3D room to watch them play. */
export function SimStart() {
  const newSim = useNewSim();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        navigate(`/vr/${await newSim()}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <Page>
      <TopBar back="/" />
      {error ? (
        <div class="flex flex-col gap-3 py-16">
          <p class="text-sm text-danger">{error}</p>
          <Link to="/" class="text-xs uppercase tracking-[0.2em] text-accent">
            Home
          </Link>
        </div>
      ) : (
        <p class="py-20 text-center text-sm text-ink-muted">
          Seating the bots<span class="wf-blink">_</span>
        </p>
      )}
    </Page>
  );
}

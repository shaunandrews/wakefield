import { useState } from "preact/hooks";
import { Link, navigate, useMutation, useQuery } from "@spacefast/zero/client";

import { normalizeCode } from "../../shared/rules";
import type { CharacterView, MeView, TableView } from "../../shared/views";
import { Btn, ErrorNote, Label, Loading, Page, TopBar, useAsync, useResilientQuery } from "../ui";
import { CharacterCard, HandleForm } from "./Home";

function CodeEntry() {
  const [code, setCode] = useState("");
  const clean = normalizeCode(code);
  return (
    <Page>
      <TopBar back="/" title="Join a table" />
      <section class="flex flex-col gap-4 py-10">
        <form
          class="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length === 4) navigate(`/join/${clean}`);
          }}
        >
          <label for="code">
            <Label>Table code</Label>
            <span class="mt-2 block text-xs text-ink-muted">Four letters, shown on the shared screen.</span>
          </label>
          <input
            id="code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            class="wf-frame border border-line bg-transparent px-4 py-6 text-center text-5xl font-bold uppercase tracking-[0.5em] text-accent outline-none focus:border-accent"
            value={clean}
            maxLength={4}
            onInput={(e) => setCode((e.target as HTMLInputElement).value)}
          />
          <Btn size="lg" type="submit" disabled={clean.length !== 4}>
            Find the table
          </Btn>
        </form>
      </section>
    </Page>
  );
}

function PickCharacter({ code }: { code: string }) {
  const me = useQuery<MeView | null>("me");
  const table = useResilientQuery<TableView | null>("tableView", code, 6000);
  const characters = useQuery<CharacterView[]>("myCharacters");
  const join = useMutation<[string, string], string>("joinCampaign");
  const [selected, setSelected] = useState("");
  const { busy, error, run } = useAsync();

  if (me === undefined || table === undefined || characters === undefined) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (table === null) {
    return (
      <Page>
        <TopBar back="/join" />
        <p class="py-16 text-center text-xs uppercase tracking-[0.2em] text-ink-muted">No signal at table {code}. Check the shared screen.</p>
      </Page>
    );
  }

  const seatedHere = table.seats.find((s) => s.userId === me?.userId);
  const takenIds = new Set(table.seats.filter((s) => s.userId !== me?.userId).map((s) => s.character.id));
  const choice = selected || seatedHere?.character.id || "";

  return (
    <Page>
      <TopBar back="/join" title={table.campaign.name} />
      <p class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
        {table.campaign.adventureTitle} · {table.seats.length} seated · <span class="text-accent">{code}</span>
      </p>

      {me && !me.hasHandle ? (
        <section class="flex flex-col gap-3">
          <Label>Identify</Label>
          <HandleForm initial={me.handle} />
        </section>
      ) : (
        <>
          <section class="flex flex-col gap-3">
            <Label>Choose character</Label>
            <div class="flex flex-col gap-2">
              {characters.length === 0 ? <p class="text-xs text-ink-muted">No characters on file.</p> : null}
              {characters.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={takenIds.has(c.id)}
                  onClick={() => setSelected(c.id)}
                  class="text-left disabled:opacity-30"
                >
                  <CharacterCard c={c} selected={choice === c.id} />
                </button>
              ))}
              <Link
                to={`/characters/new?return=${encodeURIComponent(`/join/${code}`)}`}
                class="border border-dashed border-line px-4 py-3 text-center text-xs uppercase tracking-[0.2em] text-accent hover:border-accent"
              >
                + Create a new character
              </Link>
            </div>
          </section>
          <ErrorNote error={error} />
          <Btn
            size="xl"
            busy={busy}
            disabled={!choice}
            onClick={() =>
              void run(async () => {
                await join(code, choice);
                navigate(`/play/${code}`);
              })
            }
          >
            {seatedHere && seatedHere.character.id === choice ? "Back to the table" : "Take a seat"}
          </Btn>
        </>
      )}
    </Page>
  );
}

export function Join({ code }: { code?: string }) {
  const clean = normalizeCode(code ?? "");
  return clean.length === 4 ? <PickCharacter code={clean} /> : <CodeEntry />;
}

import { useState } from "preact/hooks";
import { Link, navigate, useMutation, useQuery } from "@spacefast/zero/client";

import { normalizeCode } from "../../shared/rules";
import type { CharacterView, MeView, TableView } from "../../shared/views";
import { Btn, ErrorNote, Loading, Page, Panel, TopBar, cx, useAsync } from "../ui";
import { CharacterCard, HandleForm } from "./Home";

function CodeEntry() {
  const [code, setCode] = useState("");
  const clean = normalizeCode(code);
  return (
    <Page>
      <TopBar back="/" title="Join a table" />
      <Panel>
        <form
          class="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length === 4) navigate(`/join/${clean}`);
          }}
        >
          <label for="code" class="text-ink-muted">
            Enter the four-letter code on the shared screen.
          </label>
          <input
            id="code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            class="rounded-2xl border border-line bg-canvas px-4 py-4 text-center font-mono text-5xl font-black uppercase tracking-[0.4em] text-accent outline-none focus:border-accent"
            value={clean}
            maxLength={4}
            onInput={(e) => setCode((e.target as HTMLInputElement).value)}
          />
          <Btn size="lg" type="submit" disabled={clean.length !== 4}>
            Find the table
          </Btn>
        </form>
      </Panel>
    </Page>
  );
}

function PickCharacter({ code }: { code: string }) {
  const me = useQuery<MeView | null>("me");
  const table = useQuery<TableView | null>("tableView", code);
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
        <p class="py-16 text-center text-ink-muted">No table with code {code}. Check the shared screen and try again.</p>
      </Page>
    );
  }

  const seatedHere = table.seats.find((s) => s.userId === me?.userId);
  const takenIds = new Set(table.seats.filter((s) => s.userId !== me?.userId).map((s) => s.character.id));
  const choice = selected || seatedHere?.character.id || "";

  return (
    <Page>
      <TopBar back="/join" title={table.campaign.name} />
      <p class="text-ink-muted">
        {table.campaign.adventureTitle} · {table.seats.length} {table.seats.length === 1 ? "player" : "players"} at the table
      </p>

      {me && !me.hasHandle ? (
        <Panel title="First, you">
          <HandleForm initial={me.handle} />
        </Panel>
      ) : (
        <>
          <Panel title="Choose your character">
            <div class="flex flex-col gap-2">
              {characters.length === 0 ? <p class="text-sm text-ink-muted">You don't have a character yet.</p> : null}
              {characters.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={takenIds.has(c.id)}
                  onClick={() => setSelected(c.id)}
                  class={cx("rounded-xl text-left ring-2 transition disabled:opacity-40", choice === c.id ? "ring-accent" : "ring-transparent")}
                >
                  <CharacterCard c={c} />
                </button>
              ))}
              <Link
                to={`/characters/new?return=${encodeURIComponent(`/join/${code}`)}`}
                class="rounded-xl border border-dashed border-line px-4 py-3 text-center font-semibold text-accent hover:border-accent"
              >
                + Create a new character
              </Link>
            </div>
          </Panel>
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

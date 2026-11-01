import { useState } from "preact/hooks";
import { navigate, useMutation } from "@spacefast/zero/client";

import { normalizeCode } from "../../shared/rules";
import type { CharacterView, MeView, TableView } from "../../shared/views";
import { Btn, ErrorNote, Label, Loading, Page, TopBar, useAsync, useLiveQuery } from "../ui";
import { QuickStart } from "./Creator";
import { CharacterCard } from "./Home";

function CodeEntry() {
  const [code, setCode] = useState("");
  const clean = normalizeCode(code);
  return (
    <Page>
      <TopBar back="/" />
      <form
        class="flex flex-col gap-5 py-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length === 4) navigate(`/join/${clean}`);
        }}
      >
        <label for="code" class="text-sm text-ink-muted">
          Enter the code on the shared screen
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
    </Page>
  );
}

/** Optional player name: helps the table tell whose phone is whose. Saves on blur. */
function PlayerName({ me }: { me: MeView }) {
  const [value, setValue] = useState(me.handle);
  const save = useMutation<[string], string>("setHandle");
  return (
    <label class="flex items-center gap-3 border-b border-line pb-3">
      <span class="shrink-0 text-xs text-ink-muted">Your name</span>
      <input
        id="player-name"
        class="min-w-0 flex-1 bg-transparent py-1 text-ink outline-none placeholder:text-ink-muted"
        value={value}
        maxLength={24}
        placeholder="optional"
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onBlur={() => {
          if (value.trim() && value.trim() !== me.handle) void save(value).catch(() => undefined);
        }}
      />
    </label>
  );
}

function PickCharacter({ code }: { code: string }) {
  const me = useLiveQuery<MeView | null>("me");
  const table = useLiveQuery<TableView | null>("tableView", [code], 6000);
  const characters = useLiveQuery<CharacterView[]>("myCharacters");
  const join = useMutation<[string, string], string>("joinCampaign");
  const { busy, error, run } = useAsync();

  if (table === undefined || characters === undefined) {
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
        <p class="py-16 text-center text-sm text-ink-muted">There's no table with code {code}. Check the shared screen.</p>
      </Page>
    );
  }

  const seatedHere = table.seats.find((s) => s.userId === me?.userId);
  const takenIds = new Set(table.seats.filter((s) => s.userId !== me?.userId).map((s) => s.character.id));
  const mine = characters.filter((c) => !takenIds.has(c.id));
  const seat = (id: string) =>
    run(async () => {
      await join(code, id);
      navigate(`/play/${code}`);
    });

  return (
    <Page>
      <TopBar back="/" title={table.campaign.name} right={<span class="text-sm tracking-[0.4em] text-accent">{code}</span>} />
      {me ? <PlayerName me={me} /> : null}
      <ErrorNote error={error} />

      {mine.length > 0 ? (
        <section class="flex flex-col gap-3">
          <Label>Play as</Label>
          {mine.map((c) => (
            <button type="button" key={c.id} disabled={busy} class="text-left" onClick={() => void seat(c.id)}>
              <CharacterCard c={c} selected={seatedHere?.character.id === c.id} />
            </button>
          ))}
        </section>
      ) : null}

      <section class="flex flex-col gap-3">
        <Label>{mine.length > 0 ? "Or play someone new" : "Pick a character"}</Label>
        <QuickStart joinCode={code} />
      </section>
    </Page>
  );
}

export function Join({ code }: { code?: string }) {
  const clean = normalizeCode(code ?? "");
  return clean.length === 4 ? <PickCharacter code={clean} /> : <CodeEntry />;
}

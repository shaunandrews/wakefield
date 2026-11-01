import { useState } from "preact/hooks";
import { Link, SignInWithGoogle, signOut, useAuth, useMutation, useQuery } from "@spacefast/zero/client";

import { findCalling, findOrigin } from "../../shared/content";
import type { CampaignSummary, CharacterView, MeView } from "../../shared/views";
import { Btn, ErrorNote, Loading, Page, Panel, TopBar, useAsync } from "../ui";

export function HandleForm({ initial, onDone }: { initial: string; onDone?: () => void }) {
  const [handle, setHandle] = useState(initial);
  const save = useMutation<[string], string>("setHandle");
  const { busy, error, run } = useAsync();
  return (
    <form
      class="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await save(handle);
          onDone?.();
        });
      }}
    >
      <label class="text-sm text-ink-muted" for="handle">
        What should the table call you?
      </label>
      <div class="flex gap-2">
        <input
          id="handle"
          class="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-4 py-3 text-lg text-ink outline-none focus:border-accent"
          value={handle}
          maxLength={24}
          placeholder="Your name"
          onInput={(e) => setHandle((e.target as HTMLInputElement).value)}
        />
        <Btn type="submit" busy={busy} disabled={!handle.trim()}>
          Save
        </Btn>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

function AccountPanel({ me }: { me: MeView }) {
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  return (
    <Panel title="You">
      {editing || !me.hasHandle ? (
        <HandleForm initial={me.handle} onDone={() => setEditing(false)} />
      ) : (
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xl font-semibold">{me.handle}</p>
            <p class="text-sm text-ink-muted">{me.isGuest ? "Playing as a guest on this device" : `Signed in${auth.displayName ? ` as ${auth.displayName}` : ""}`}</p>
          </div>
          <Btn tone="ghost" size="sm" onClick={() => setEditing(true)}>
            Rename
          </Btn>
        </div>
      )}
      <div class="mt-4 border-t border-line pt-4">
        {me.isGuest ? (
          <div class="flex flex-col gap-2">
            <p class="text-sm text-ink-muted">Sign in to keep your characters across devices. Anything you made as a guest comes with you.</p>
            <div>
              <SignInWithGoogle />
            </div>
          </div>
        ) : (
          <Btn tone="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Btn>
        )}
      </div>
    </Panel>
  );
}

export function CharacterCard({ c, to }: { c: CharacterView; to?: string }) {
  const origin = findOrigin(c.origin);
  const variant = origin?.variants?.find((v) => v.key === c.variant);
  const calling = findCalling(c.calling);
  const body = (
    <div class="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 transition hover:border-accent">
      <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-bold text-accent">{c.name.slice(0, 1).toUpperCase()}</div>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold text-ink">{c.name}</p>
        <p class="truncate text-sm text-ink-muted">
          {variant ? `${variant.name} ` : ""}
          {origin?.name} · {calling?.name} · Lv {c.level}
        </p>
      </div>
      <span class="text-xs tabular-nums text-ink-muted">
        {c.vigor}/{c.sheet.vigorMax}
      </span>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Home() {
  const me = useQuery<MeView | null>("me");
  const characters = useQuery<CharacterView[]>("myCharacters");
  const campaigns = useQuery<CampaignSummary[]>("myCampaigns");

  if (me === undefined) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }

  return (
    <Page>
      <TopBar />
      <section class="relative overflow-hidden rounded-3xl border border-line bg-surface px-5 py-8">
        <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div class="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-[#ff4fa3]/15 blur-3xl" />
        <p class="text-xs uppercase tracking-[0.3em] text-accent">A tabletop RPG for a shared screen</p>
        <h1 class="mt-2 text-4xl font-black leading-tight">Wakefield</h1>
        <p class="mt-3 max-w-md text-ink-muted">
          A half-drowned city where humans, augmented humans, AIs, and stranger peoples live under a fragile peace. Put an iPad in the middle of the table. Everyone
          plays from their phone.
        </p>
        <div class="mt-6 grid grid-cols-2 gap-3">
          <Link to="/join" class="rounded-2xl bg-accent px-4 py-4 text-center text-lg font-bold text-canvas shadow-[0_0_30px_-8px] shadow-accent">
            Join a table
            <span class="block text-xs font-medium opacity-80">on your phone</span>
          </Link>
          <Link to="/host" class="rounded-2xl border border-accent px-4 py-4 text-center text-lg font-bold text-accent">
            Host a table
            <span class="block text-xs font-medium opacity-80">on the shared screen</span>
          </Link>
        </div>
      </section>

      {me ? <AccountPanel me={me} /> : null}

      <Panel title="Your characters">
        <div class="flex flex-col gap-2">
          {characters === undefined ? <Loading /> : null}
          {characters?.length === 0 ? <p class="text-sm text-ink-muted">No characters yet. Every crew needs someone.</p> : null}
          {characters?.map((c) => <CharacterCard key={c.id} c={c} to={`/characters/${c.id}`} />)}
          <Link to="/characters/new" class="mt-1 rounded-xl border border-dashed border-line px-4 py-3 text-center font-semibold text-accent hover:border-accent">
            + Create a character
          </Link>
        </div>
      </Panel>

      {campaigns && campaigns.length > 0 ? (
        <Panel title="Your campaigns">
          <ul class="flex flex-col gap-2">
            {campaigns.map((c) => (
              <li key={c.code}>
                <Link
                  to={c.role === "host" ? `/table/${c.code}` : `/play/${c.code}`}
                  class="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3 hover:border-accent"
                >
                  <div class="min-w-0">
                    <p class="truncate font-semibold">{c.name}</p>
                    <p class="text-sm text-ink-muted">
                      {c.adventureTitle} · {c.role === "host" ? "You host" : "You play"} · {c.phase === "ended" ? "Ended" : c.phase === "lobby" ? "In lobby" : "In progress"}
                    </p>
                  </div>
                  <span class="rounded-lg bg-surface px-2 py-1 font-mono text-sm tracking-widest text-accent">{c.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <p class="text-center text-xs text-ink-muted">Awake? — And glad of it.</p>
    </Page>
  );
}

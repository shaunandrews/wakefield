import { useState } from "preact/hooks";
import { Link, SignInWithGoogle, signOut, useAuth, useMutation, useQuery } from "@spacefast/zero/client";

import { findCalling, findOrigin } from "../../shared/content";
import type { CampaignSummary, CharacterView, MeView } from "../../shared/views";
import { Btn, ErrorNote, Label, Loading, Page, TopBar, cx, useAsync } from "../ui";

export { FIELD as inputClass } from "../design";
import { FIELD as inputClass } from "../design";

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
      <label class="text-xs text-ink-muted" for="handle">
        What should the table call you?
      </label>
      <div class="flex">
        <input
          id="handle"
          class={cx(inputClass, "border-r-0")}
          value={handle}
          maxLength={24}
          placeholder="your name"
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

function AccountSection({ me }: { me: MeView }) {
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  return (
    <section class="flex flex-col gap-3">
      <Label>Identity</Label>
      {editing || !me.hasHandle ? (
        <HandleForm initial={me.handle} onDone={() => setEditing(false)} />
      ) : (
        <div class="flex items-baseline justify-between gap-3 border-b border-line pb-3">
          <div>
            <p class="text-lg text-ink">{me.handle}</p>
            <p class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
              {me.isGuest ? "guest · this device" : `signed in${auth.displayName ? ` · ${auth.displayName}` : ""}`}
            </p>
          </div>
          <button type="button" class="text-[11px] uppercase tracking-[0.2em] text-ink-muted hover:text-accent" onClick={() => setEditing(true)}>
            rename
          </button>
        </div>
      )}
      {me.isGuest ? (
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span>Sign in to keep characters across devices.</span>
          <span class="text-ink">
            <SignInWithGoogle />
          </span>
        </div>
      ) : (
        <button type="button" class="self-start text-[11px] uppercase tracking-[0.2em] text-ink-muted hover:text-danger" onClick={() => void signOut()}>
          sign out
        </button>
      )}
    </section>
  );
}

export function CharacterCard({ c, to, selected }: { c: CharacterView; to?: string; selected?: boolean }) {
  const origin = findOrigin(c.origin);
  const variant = origin?.variants?.find((v) => v.key === c.variant);
  const calling = findCalling(c.calling);
  const body = (
    <div class={cx("flex items-center gap-4 border px-4 py-3 transition-colors hover:border-ink-muted", selected ? "border-accent" : "border-line")}>
      <span class={cx("w-4 text-xs", selected ? "text-accent" : "text-ink-muted")}>{selected ? "▶" : "·"}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-ink">{c.name}</p>
        <p class="truncate text-[11px] uppercase tracking-[0.15em] text-ink-muted">
          {variant ? `${variant.name} ` : ""}
          {origin?.name} · {calling?.name} · lv{c.level}
        </p>
      </div>
      <span class="text-[11px] tabular-nums text-ink-muted">
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
      <TopBar right={<span class="text-[11px] uppercase tracking-[0.2em] text-ink-muted">sys.online</span>} />

      <section class="flex flex-col gap-6 py-8">
        <Label>Halden-Wakefield · 2194</Label>
        <h1 class="text-5xl font-bold uppercase leading-none tracking-[0.08em] text-ink">
          Wake
          <br />
          field<span class="wf-blink text-accent">_</span>
        </h1>
        <p class="wf-read max-w-sm text-ink-muted">
          A drowned city where humans, chrome, machine minds, and stranger things keep a fragile peace. One shared screen. Every player on their phone.
        </p>
        <div class="grid grid-cols-2 gap-3">
          <Link to="/join" class="border border-accent bg-accent px-4 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-canvas hover:bg-transparent hover:text-accent">
            Join table
          </Link>
          <Link to="/host" class="border border-line px-4 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-ink hover:border-ink">
            Host table
          </Link>
        </div>
      </section>

      {me ? <AccountSection me={me} /> : null}

      <section class="flex flex-col gap-3">
        <Label>Characters</Label>
        {characters === undefined ? <Loading /> : null}
        {characters?.length === 0 ? <p class="text-xs text-ink-muted">No characters on file.</p> : null}
        {characters?.map((c) => <CharacterCard key={c.id} c={c} to={`/characters/${c.id}`} />)}
        <Link to="/characters/new" class="border border-dashed border-line px-4 py-3 text-center text-xs uppercase tracking-[0.2em] text-accent hover:border-accent">
          + new character
        </Link>
      </section>

      {campaigns && campaigns.length > 0 ? (
        <section class="flex flex-col gap-3">
          <Label>Campaigns</Label>
          {campaigns.map((c) => (
            <Link
              key={c.code}
              to={c.role === "host" ? `/table/${c.code}` : `/play/${c.code}`}
              class="flex items-center justify-between gap-3 border border-line px-4 py-3 hover:border-ink-muted"
            >
              <div class="min-w-0">
                <p class="truncate text-ink">{c.name}</p>
                <p class="text-[11px] uppercase tracking-[0.15em] text-ink-muted">
                  {c.role} · {c.phase === "ended" ? "ended" : c.phase === "lobby" ? "lobby" : "live"}
                </p>
              </div>
              <span class="text-sm tracking-[0.3em] text-accent">{c.code}</span>
            </Link>
          ))}
        </section>
      ) : null}

      <p class="pt-6 text-center text-[11px] uppercase tracking-[0.25em] text-ink-muted">awake? — and glad of it.</p>
    </Page>
  );
}

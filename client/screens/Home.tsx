import { Link, SignInWithGoogle, signOut, useAuth } from "@spacefast/zero/client";

import { findCalling, findOrigin } from "../../shared/content";
import type { CampaignSummary, CharacterView, MeView } from "../../shared/views";
import { Label, Loading, Page, TopBar, cx, useLiveQuery } from "../ui";

export function CharacterCard({ c, to, selected }: { c: CharacterView; to?: string; selected?: boolean }) {
  const origin = findOrigin(c.origin);
  const variant = origin?.variants?.find((v) => v.key === c.variant);
  const calling = findCalling(c.calling);
  const body = (
    <div class={cx("flex items-baseline justify-between gap-4 border px-4 py-3 transition-colors hover:border-ink-muted", selected ? "border-accent" : "border-line")}>
      <div class="min-w-0">
        <p class={cx("truncate text-lg", selected ? "text-accent" : "text-ink")}>{c.name}</p>
        <p class="truncate text-xs text-ink-muted">
          {variant ? `${variant.name} ` : ""}
          {origin?.name} {calling?.name.toLowerCase()}
          {c.level > 1 ? ` · level ${c.level}` : ""}
        </p>
      </div>
      {c.vigor < c.sheet.vigorMax ? (
        <span class="shrink-0 text-xs tabular-nums text-ink-muted">
          Vigor {c.vigor}/{c.sheet.vigorMax}
        </span>
      ) : null}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Account({ me }: { me: MeView }) {
  const auth = useAuth();
  if (me.isGuest) {
    return (
      <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        <span>Keep your characters on every device:</span>
        <span class="text-ink">
          <SignInWithGoogle />
        </span>
      </div>
    );
  }
  return (
    <p class="text-center text-xs text-ink-muted">
      Signed in{auth.displayName ? ` as ${auth.displayName}` : ""} ·{" "}
      <button type="button" class="underline hover:text-ink" onClick={() => void signOut()}>
        sign out
      </button>
    </p>
  );
}

export function Home() {
  const me = useLiveQuery<MeView | null>("me");
  const characters = useLiveQuery<CharacterView[]>("myCharacters");
  const campaigns = useLiveQuery<CampaignSummary[]>("myCampaigns");

  if (me === undefined || characters === undefined || campaigns === undefined) {
    return (
      <Page>
        <TopBar />
        <Loading />
      </Page>
    );
  }

  const live = campaigns.filter((c) => c.phase !== "ended");
  const current = live[0];
  const firstVisit = characters.length === 0 && campaigns.length === 0;

  return (
    <Page>
      <TopBar />

      {current ? (
        <Link
          to={current.role === "host" ? `/table/${current.code}` : `/play/${current.code}`}
          class="wf-frame flex items-center justify-between gap-4 border border-line px-5 py-5 hover:border-accent"
        >
          <div class="min-w-0">
            <p class="text-xs text-ink-muted">Continue</p>
            <p class="truncate text-xl text-ink">{current.name}</p>
            <p class="text-xs text-ink-muted">
              {current.adventureTitle} · {current.role === "host" ? "on this screen" : "as a player"}
            </p>
          </div>
          <span class="text-accent">›</span>
        </Link>
      ) : null}

      {firstVisit ? (
        <section class="flex flex-col gap-4 py-6">
          <h1 class="text-5xl font-bold uppercase leading-none tracking-[0.08em] text-ink">
            Wake
            <br />
            field<span class="wf-blink text-accent">_</span>
          </h1>
          <p class="wf-read max-w-sm text-ink-muted">
            A drowned city where humans, chrome, machine minds and stranger things keep a fragile peace. One shared screen. Everyone plays from their phone.
          </p>
        </section>
      ) : null}

      <div class="grid grid-cols-2 gap-3">
        <Link to="/join" class="border border-accent bg-accent px-4 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-canvas hover:bg-transparent hover:text-accent">
          Join a table
        </Link>
        <Link to="/host" class="border border-line px-4 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-ink hover:border-ink">
          Host a table
        </Link>
      </div>

      {characters.length > 0 ? (
        <section class="flex flex-col gap-3">
          <Label>Your characters</Label>
          {characters.map((c) => (
            <CharacterCard key={c.id} c={c} to={`/characters/${c.id}`} />
          ))}
          <Link to="/characters/new" class="py-2 text-center text-xs uppercase tracking-[0.2em] text-ink-muted hover:text-accent">
            New character
          </Link>
        </section>
      ) : (
        <Link to="/characters/new" class="text-center text-xs uppercase tracking-[0.2em] text-ink-muted hover:text-accent">
          Make a character
        </Link>
      )}

      {live.length > 1 ? (
        <section class="flex flex-col gap-3">
          <Label>Other games</Label>
          {live.slice(1).map((c) => (
            <Link
              key={c.code}
              to={c.role === "host" ? `/table/${c.code}` : `/play/${c.code}`}
              class="flex items-baseline justify-between gap-3 border border-line px-4 py-3 hover:border-ink-muted"
            >
              <span class="truncate text-ink">{c.name}</span>
              <span class="text-xs tracking-[0.3em] text-ink-muted">{c.code}</span>
            </Link>
          ))}
        </section>
      ) : null}

      {me ? (
        <div class="mt-auto pt-8">
          <Account me={me} />
        </div>
      ) : null}
    </Page>
  );
}

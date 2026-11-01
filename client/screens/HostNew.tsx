import { useState } from "preact/hooks";
import { navigate, useMutation } from "@spacefast/zero/client";

import { ADVENTURES } from "../../shared/adventures";
import { Btn, ErrorNote, Label, Page, TopBar, cx, useAsync } from "../ui";

export function HostNew() {
  const [name, setName] = useState("");
  const [adventure, setAdventure] = useState(ADVENTURES[0].key);
  const create = useMutation<[string, string], string>("createCampaign");
  const { busy, error, run } = useAsync();

  return (
    <Page>
      <TopBar back="/" title="Host a table" />
      <p class="wf-read text-sm text-ink-muted">
        Open this on the device everyone can see. An iPad in the middle of the table works best. It becomes the shared screen for the story, the crew, and the
        dice. Players join from their phones.
      </p>
      <section class="flex flex-col gap-3">
        <Label>Campaign name</Label>
        <input
          class="w-full border border-line bg-transparent px-3 py-3 text-ink outline-none transition-colors focus:border-accent"
          value={name}
          maxLength={60}
          placeholder="Friday Night Tide"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </section>
      <section class="flex flex-col gap-3">
        <Label>Adventure</Label>
        <div class="flex flex-col gap-2">
          {ADVENTURES.map((a) => (
            <button
              type="button"
              key={a.key}
              onClick={() => setAdventure(a.key)}
              class={cx("border px-4 py-3 text-left transition-colors", adventure === a.key ? "border-accent" : "border-line hover:border-ink-muted")}
            >
              <p class={cx("uppercase tracking-[0.15em]", adventure === a.key ? "text-accent" : "text-ink")}>{a.title}</p>
              <p class="wf-read mt-1 text-sm text-ink-muted">{a.pitch}</p>
              <p class="mt-2 text-[10px] uppercase tracking-[0.2em] text-ink-muted">{a.scenes.length} scenes · 1–2 hrs</p>
            </button>
          ))}
        </div>
      </section>
      <ErrorNote error={error} />
      <Btn
        size="xl"
        busy={busy}
        onClick={() =>
          void run(async () => {
            const code = await create(name, adventure);
            navigate(`/table/${code}`);
          })
        }
      >
        Open the table
      </Btn>
    </Page>
  );
}

import { useState } from "preact/hooks";
import { navigate, useMutation } from "@spacefast/zero/client";

import { ADVENTURES } from "../../shared/adventures";
import { Btn, ErrorNote, Page, Panel, TopBar, cx, useAsync } from "../ui";

export function HostNew() {
  const [name, setName] = useState("");
  const [adventure, setAdventure] = useState(ADVENTURES[0].key);
  const create = useMutation<[string, string], string>("createCampaign");
  const { busy, error, run } = useAsync();

  return (
    <Page>
      <TopBar back="/" title="Host a table" />
      <p class="text-ink-muted">
        Open this on the device everyone can see — an iPad propped in the middle of the table is perfect. It becomes the shared screen: the story, the map of who's
        who, and the dice. Players join from their phones.
      </p>
      <Panel title="Campaign name">
        <input
          class="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-lg outline-none focus:border-accent"
          value={name}
          maxLength={60}
          placeholder="Friday Night Tide"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </Panel>
      <Panel title="Adventure">
        <div class="flex flex-col gap-2">
          {ADVENTURES.map((a) => (
            <button
              type="button"
              key={a.key}
              onClick={() => setAdventure(a.key)}
              class={cx("rounded-2xl border px-4 py-3 text-left", adventure === a.key ? "border-accent bg-accent/10" : "border-line")}
            >
              <p class="text-lg font-bold">{a.title}</p>
              <p class="text-sm text-ink-muted">{a.pitch}</p>
              <p class="mt-1 text-xs text-ink-muted">{a.scenes.length} scenes · about 1–2 hours</p>
            </button>
          ))}
        </div>
      </Panel>
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

import { navigate, useMutation } from "@spacefast/zero/client";

import type { CharacterView } from "../../shared/views";
import { Sheet } from "../components/Sheet";
import { Btn, ErrorNote, Loading, Page, TopBar, useAsync, useLiveQuery } from "../ui";

export function CharacterPage({ id }: { id: string }) {
  const character = useLiveQuery<CharacterView | null>("character", [id]);
  const archive = useMutation<[string], void>("archiveCharacter");
  const { busy, error, run } = useAsync();

  if (character === undefined) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (character === null) {
    return (
      <Page>
        <TopBar back="/" />
        <p class="py-20 text-center text-ink-muted">That character has drifted out to sea.</p>
      </Page>
    );
  }
  return (
    <Page>
      <TopBar back="/" />
      <Sheet c={character} />
      <ErrorNote error={error} />
      {character.isMine ? (
        <Btn
          tone="danger"
          size="sm"
          busy={busy}
          onClick={() => {
            if (!confirm(`Retire ${character.name}? They'll leave your roster.`)) return;
            void run(async () => {
              await archive(character.id);
              navigate("/");
            });
          }}
        >
          Retire character
        </Btn>
      ) : null}
    </Page>
  );
}

"use client";

import { CharacterPage } from "../../client/screens/CharacterPage";

export default function Page({ params }: { params: { id: string } }) {
  return <CharacterPage id={params.id} />;
}

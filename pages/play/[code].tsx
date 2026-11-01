"use client";

import { Play } from "../../client/screens/Play";

export default function Page({ params }: { params: { code: string } }) {
  return <Play code={params.code} />;
}

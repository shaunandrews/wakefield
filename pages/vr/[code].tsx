"use client";

import { VrRoom } from "../../client/screens/VrRoom";

export default function Page({ params }: { params: { code: string } }) {
  return <VrRoom code={params.code} />;
}

"use client";

import { Join } from "../../client/screens/Join";

export default function Page({ params }: { params: { code: string } }) {
  return <Join code={params.code} />;
}

"use client";

import { Table } from "../../client/screens/Table";

export default function Page({ params }: { params: { code: string } }) {
  return <Table code={params.code} />;
}

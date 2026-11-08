"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";

const WebEditorClient = dynamic(() => import("./WebEditorClient"), {
  ssr: false,
  loading: () => <p role="status">Cargando editor de páginas…</p>,
});

export default function WebEditorLoader(props: ComponentProps<typeof WebEditorClient>) {
  return <WebEditorClient {...props} />;
}

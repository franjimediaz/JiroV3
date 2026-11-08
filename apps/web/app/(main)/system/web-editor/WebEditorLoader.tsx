"use client";

import dynamic from "next/dynamic";

const WebEditorClient = dynamic(() => import("./WebEditorClient"), {
  ssr: false,
  loading: () => <p role="status">Cargando editor de páginas…</p>,
});

export default function WebEditorLoader({ previewCss }: { previewCss: string }) {
  return <WebEditorClient previewCss={previewCss} />;
}

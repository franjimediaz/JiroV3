"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Puck, useGetPuck, type Overrides } from "@puckeditor/core";
import { webPuckConfig } from "@repo/web-puck";
import { createEditorExample, editorErrorMessage, serializeEditorPage } from "./fixture";
import "@puckeditor/core/no-external.css";
import styles from "./web-editor.module.css";

type Notice = { kind: "success" | "error"; text: string };
type ActionProps = { reset: () => void; notify: (notice: Notice) => void };

function EditorActions({ reset, notify }: ActionProps) {
  const getPuck = useGetPuck();
  const [saved, setSaved] = useState(() => JSON.stringify(createEditorExample()));

  function validate() {
    try {
      serializeEditorPage(getPuck().appState.data);
      notify({ kind: "success", text: "JSON válido. Los datos son compatibles con Web Static." });
    } catch (error) {
      notify({ kind: "error", text: editorErrorMessage(error) });
    }
  }

  function download() {
    try {
      const data = getPuck().appState.data;
      const json = serializeEditorPage(data);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "page.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(JSON.stringify(data));
      notify({ kind: "success", text: "page.json exportado. No se ha publicado ni guardado en el servidor." });
    } catch (error) {
      notify({ kind: "error", text: editorErrorMessage(error) });
    }
  }

  function restore() {
    const changed = JSON.stringify(getPuck().appState.data) !== saved;
    if (changed && !window.confirm("Hay cambios sin exportar. ¿Quieres descartarlos y restablecer el ejemplo?")) return;
    reset();
  }

  return <div className={styles.actions}>
    <button type="button" onClick={validate}>Validar JSON</button>
    <button type="button" onClick={download}>Exportar JSON</button>
    <button type="button" onClick={restore}>Restablecer ejemplo</button>
  </div>;
}

export default function WebEditorClient({ previewCss }: { previewCss: string }) {
  const [example, setExample] = useState(createEditorExample);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const overrides = useMemo<Partial<Overrides<typeof webPuckConfig>>>(() => ({
    iframe: ({ children }: { children: ReactNode }) => <><style>{previewCss}</style>{children}</>,
    headerActions: () => <EditorActions notify={setNotice} reset={() => {
      setExample(createEditorExample());
      setRevision(value => value + 1);
      setNotice({ kind: "success", text: "Ejemplo restablecido." });
    }} />,
  }), [previewCss]);

  return <section className={styles.editor} aria-label="Editor de páginas web">
    <div className={styles.intro}>
      <h1>Editor web</h1>
      <p>Herramienta provisional. Los cambios solo permanecen en esta sesión; exporta JSON para conservarlos.</p>
    </div>
    {notice && <p className={notice.kind === "error" ? styles.error : styles.success}
      role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    <Puck
      key={revision}
      config={webPuckConfig}
      data={example}
      overrides={overrides}
      iframe={{ enabled: true, syncHostStyles: false }}
      viewports={[
        { width: 1280, height: 900, label: "Escritorio" },
        { width: 390, height: 844, label: "Móvil" },
      ]}
      headerTitle="Web Static"
      headerPath="/system/web-editor"
      height="calc(100dvh - 12rem)"
    />
  </section>;
}

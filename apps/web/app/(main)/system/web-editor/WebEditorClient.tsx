"use client";

import { useCallback, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { Puck, useGetPuck, type Overrides } from "@puckeditor/core";
import { saveWebPageDraft } from "@/actions/webPages";
import { webPuckConfig, type WebPuckData } from "@repo/web-puck";
import { createEditorExample, editorErrorMessage, serializeEditorPage } from "./fixture";
import "@puckeditor/core/no-external.css";
import styles from "./web-editor.module.css";

type Notice = { kind: "success" | "error"; text: string };
type ActionProps = { reset: () => void; notify: (notice: Notice) => void; save: () => Promise<void>; busy: boolean; dirty: boolean };

function EditorActions({ reset, notify, save, busy, dirty }: ActionProps) {
  const getPuck = useGetPuck();


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

      notify({ kind: "success", text: "page.json exportado. No se ha publicado ni guardado en el servidor." });
    } catch (error) {
      notify({ kind: "error", text: editorErrorMessage(error) });
    }
  }

  function restore() {
    const changed = dirty;
    if (changed && !window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos y restablecer el ejemplo?")) return;
    reset();
  }

  return <div className={styles.actions}>
    <button type="button" disabled={busy} onClick={save}>{busy ? "Guardando..." : "Guardar borrador"}</button>
    <button type="button" onClick={validate}>Validar JSON</button>
    <button type="button" onClick={download}>Exportar JSON</button>
    <button type="button" disabled={busy} onClick={restore}>Restablecer ejemplo</button>
  </div>;
}

export default function WebEditorClient({ previewCss, initialData, initialRevision, description }: { previewCss: string; initialData: WebPuckData; initialRevision: number | null; description: string | null }) {
  const [example, setExample] = useState(() => structuredClone(initialData));
  const current = useRef(initialData);
  const saved = useRef(JSON.stringify(initialData));
  const databaseRevision = useRef(initialRevision);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Sin cambios");
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setStatus("Guardando");
    try {
      const snapshot = serializeEditorPage(current.current);
      const puckData: WebPuckData = JSON.parse(snapshot);
      const result = await saveWebPageDraft({ title: puckData.root.props?.title ?? "Página", description, puckData, revision: databaseRevision.current });
      if (!result.ok) throw new Error(result.message);
      databaseRevision.current = result.revision;
      saved.current = JSON.stringify(puckData);
      const changed = JSON.stringify(current.current) !== saved.current;
      setDirty(changed); setStatus(changed ? "Cambios sin guardar" : "Guardado");
      setNotice({ kind: "success", text: result.message });
    } catch (error) { setStatus("Error"); setNotice({ kind: "error", text: editorErrorMessage(error) }); }
    finally { inFlight.current = false; setBusy(false); }
  }, [description]);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const overrides = useMemo<Partial<Overrides<typeof webPuckConfig>>>(() => ({
    iframe: ({ children }: { children: ReactNode }) => <><style>{previewCss}</style>{children}</>,
    headerActions: () => <EditorActions notify={setNotice} save={save} busy={busy} dirty={dirty} reset={() => {
      current.current = createEditorExample();
      saved.current = ""; setDirty(true); setStatus("Cambios sin guardar");
      setExample(createEditorExample());
      setRevision(value => value + 1);
      setNotice({ kind: "success", text: "Ejemplo restablecido." });
    }} />,
  }), [previewCss, busy, dirty, save]);

  return <section className={styles.editor} aria-label="Editor de páginas web">
    <div className={styles.intro}>
      <h1>Editor web</h1>
      <p>Guarda el borrador para conservar los cambios en Jiro. Exportar JSON no guarda el borrador.</p>
    </div>
    {notice && <p className={notice.kind === "error" ? styles.error : styles.success}
      role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    <p role="status">{status}</p>
    <Puck
      key={revision}
      config={webPuckConfig}
      data={example}
      onChange={data => { current.current = data; const changed = JSON.stringify(data) !== saved.current; setDirty(changed); if (!inFlight.current) setStatus(changed ? "Cambios sin guardar" : "Sin cambios"); }}
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

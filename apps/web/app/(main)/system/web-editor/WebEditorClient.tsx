"use client";

import { useCallback, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { Puck, useGetPuck, type Overrides } from "@puckeditor/core";
import Link from "next/link";
import { saveWebPageDraft, saveWebPageDraftById } from "@/actions/webPages";
import { webPuckConfig, type WebPuckData } from "@repo/web-puck";
import { createEditorExample, editorErrorMessage, serializeEditorPage } from "./fixture";
import "@puckeditor/core/no-external.css";
import styles from "./web-editor.module.css";

function normalized(data: unknown) { try { return serializeEditorPage(data); } catch { return null; } }

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

export default function WebEditorClient({ previewCss, initialData, initialRevision, description, pageId, publicPath = "/" }: { pageId?: string; publicPath?: string; previewCss: string; initialData: WebPuckData; initialRevision: number | null; description: string | null }) {
  const [example, setExample] = useState(() => structuredClone(initialData));
  const current = useRef(initialData);
  const saved = useRef(serializeEditorPage(initialData));
  const previousSnapshot = useRef<string | null>(saved.current);
  const identity = useRef(pageId);
  const databaseRevision = useRef(initialRevision);
  const inFlight = useRef(false);
  const [pageTitle, setPageTitle] = useState(initialData.root.props?.title ?? "Editor web");
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
      const byId = identity.current ? await saveWebPageDraftById({ id: identity.current, revision: databaseRevision.current, puckData }) : null;
      const result = byId ? (byId.ok ? {ok:true,code:"OK",message:"Borrador guardado.",revision:byId.data.revision,id:byId.data.id} : {...byId,revision:null,id:null}) : await saveWebPageDraft({ title: puckData.root.props?.title ?? "Página", description, puckData, revision: databaseRevision.current });
      if (!result.ok) { setStatus(result.code === "CONFLICT" ? "Conflicto" : "Error"); setNotice({kind:"error",text:result.message}); return; }
      identity.current = result.id ?? identity.current;
      databaseRevision.current = result.revision;
      saved.current = serializeEditorPage(puckData);
      const changed = normalized(current.current) !== saved.current;
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
      setPageTitle(current.current.root.props?.title ?? "Editor web");
      saved.current = ""; setDirty(true); setStatus("Cambios sin guardar");
      setExample(createEditorExample());
      setRevision(value => value + 1);
      setNotice({ kind: "success", text: "Ejemplo restablecido." });
    }} />,
  }), [previewCss, busy, dirty, save]);

  return <section className={styles.editor} aria-label="Editor de páginas web">
    <div className={styles.intro}>
      <h1>{pageTitle}</h1>
      <p>Ruta pública: {publicPath} · <Link href="/system/web-pages">Volver al listado</Link></p>
      <p>Guarda el borrador para conservar los cambios en Jiro. Exportar JSON no guarda el borrador.</p>
    </div>
    {notice && <p className={notice.kind === "error" ? styles.error : styles.success}
      role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    <p role="status">{status}</p>
    <Puck
      key={revision}
      config={webPuckConfig}
      data={example}
      onChange={data => {
        const previous = previousSnapshot.current;
        const next = normalized(data);
        previousSnapshot.current = next;
        current.current = data;
        setPageTitle(data.root.props?.title ?? "Editor web");
        const changed = next !== saved.current;
        setDirty(changed);
        if (!inFlight.current && previous !== next) setStatus(changed ? "Cambios sin guardar" : "Sin cambios");
      }}
      overrides={overrides}
      iframe={{ enabled: true, syncHostStyles: false }}
      viewports={[
        { width: 1280, height: 900, label: "Escritorio" },
        { width: 390, height: 844, label: "Móvil" },
      ]}
      headerTitle="Web Static"
      headerPath={publicPath}
      height="calc(100dvh - 12rem)"
    />
  </section>;
}

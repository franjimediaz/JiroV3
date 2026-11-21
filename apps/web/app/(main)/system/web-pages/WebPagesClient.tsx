
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ListView } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";

import { generateWebPublication } from "@/actions/webPublication";
import {
  checkWebGithubPublication,
  prepareWebPublication,
  publishWebPublication,
} from "@/actions/webGithub";

import type { listWebPages } from "@/actions/webPages";

// =====================================================
// TIPOS
// =====================================================

type PagesResult = Awaited<ReturnType<typeof listWebPages>>;
type GithubResult = Awaited<
  ReturnType<typeof checkWebGithubPublication>
>;
type Preparation = Awaited<
  ReturnType<typeof prepareWebPublication>
>;
type PublishResult = Awaited<
  ReturnType<typeof publishWebPublication>
>;

type ComparisonData = {
  localPageCount: number;
  remotePageCount: number;
  addedPaths: string[];
  updatedPaths: string[];
  removedPaths: string[];
};

type WarningData = {
  path: string;
  url: string;
  message: string;
};

// =====================================================
// CONFIGURACIÓN DEL LISTADO JIRO
// =====================================================

const webPagesSchema: ModuleSchema = {
  db: {
    table: "web_pages",
    primaryKey: "id",
  },

  ui: {
    titlePlural: "Páginas web",
    titleSingular: "Página web",
    icon: "bi bi-globe",
    color: "#245749",
  },

  capabilities: {
    allowCreate: true,
    allowEdit: true,
    allowDelete: false,
    allowSearch: true,
    allowExport: false,
    allowImport: false,
  },

  fields: [
    {
      name: "title",
      label: "Título",
      type: "text",
      list: true,
      filter: true,
    },
    {
      name: "path",
      label: "Ruta pública",
      type: "text",
      list: true,
      filter: true,
    },
    {
      name: "revision",
      label: "Revisión",
      type: "number",
      list: true,
    },
    {
      name: "updated_at",
      label: "Última modificación",
      type: "datetime",
      list: true,
    },
  ],
};

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function WebPagesClient({
  result,
}: {
  result: PagesResult;
}) {
  const router = useRouter();

  // Estados de notificaciones
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);

  // Estados de operaciones
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Resultados GitHub
  const [github, setGithub] = useState<GithubResult | null>(
    null
  );

  const [preparation, setPreparation] =
    useState<Preparation | null>(null);

  const [publishResult, setPublishResult] =
    useState<PublishResult | null>(null);

  // Evitar operaciones duplicadas
  const generateLock = useRef(false);
  const checkLock = useRef(false);
  const publishLock = useRef(false);

  const busy = generating || checking || publishing;

  // ===================================================
  // GENERAR PUBLICACIÓN JSON
  // ===================================================

  async function generate() {
    if (generateLock.current || busy) return;

    generateLock.current = true;
    setGenerating(true);
    setFailed(false);
    setNotice("");

    try {
      const response = await generateWebPublication();

      if (!response.ok || response.json === null) {
        setFailed(true);
        setNotice(response.message);
        return;
      }

      const blob = new Blob([response.json], {
        type: "application/json;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "publication.json";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      setNotice(
        `${response.pageCount} páginas incluidas. ${response.message}`
      );
    } catch {
      setFailed(true);
      setNotice(
        "No se pudo generar la publicación. Inténtalo de nuevo."
      );
    } finally {
      generateLock.current = false;
      setGenerating(false);
    }
  }

  // ===================================================
  // COMPROBAR PUBLICACIÓN GITHUB
  // ===================================================

  async function checkGithub() {
    if (checkLock.current || busy) return;

    checkLock.current = true;
    setChecking(true);
    setGithub(null);

    try {
      const response = await checkWebGithubPublication();
      setGithub(response);
    } catch {
      setGithub({
        ok: false,
        code: "INTERNAL",
        message:
          "No se pudo conectar con GitHub. Inténtalo de nuevo.",
        branch: null,
        comparison: null,
        warnings: [],
      });
    } finally {
      checkLock.current = false;
      setChecking(false);
    }
  }

  // ===================================================
  // PREPARAR PUBLICACIÓN
  // ===================================================

  async function prepare() {
    if (publishLock.current || busy) return;

    publishLock.current = true;
    setPublishing(true);
    setPreparation(null);
    setPublishResult(null);

    try {
      const response = await prepareWebPublication();
      setPreparation(response);
    } catch {
      setPublishResult({
        ok: false,
        code: "INTERNAL",
        message: "No se pudo preparar la publicación.",
        publicationId: null,
        pageCount: 0,
        commitSha: null,
        commitUrl: null,
      });
    } finally {
      publishLock.current = false;
      setPublishing(false);
    }
  }

  // ===================================================
  // CONFIRMAR PUBLICACIÓN
  // ===================================================

  async function confirm() {
    if (
      publishLock.current ||
      !preparation?.ok ||
      !preparation.preparationToken
    ) {
      return;
    }

    publishLock.current = true;
    setPublishing(true);
    setPublishResult(null);

    try {
      const response = await publishWebPublication({
        preparationToken: preparation.preparationToken,
      });

      setPublishResult(response);

      if (response.ok) {
        setPreparation(null);
        setGithub(null);
      }
    } catch {
      setPublishResult({
        ok: false,
        code: "INTERNAL",
        message: "No se pudo publicar la web.",
        publicationId: null,
        pageCount: 0,
        commitSha: null,
        commitUrl: null,
      });
    } finally {
      publishLock.current = false;
      setPublishing(false);
    }
  }

  // ===================================================
  // INTERFAZ
  // ===================================================

  return (
    <section className="p-3">

      {/* CABECERA */}

      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">

        <div>
          <h1 className="h4 fw-semibold mb-1">
            <i className="bi bi-globe me-2" />
            Páginas web
          </h1>

          <p className="text-muted small mb-0">
            Gestiona, diseña y publica las páginas de tu sitio web.
          </p>
        </div>

        <Link
          href="/system/web-pages/settings"
          className="btn btn-outline-secondary btn-sm"
        >
          <i className="bi bi-gear me-2" />
          Configurar Header global
        </Link>

      </div>

      {/* BARRA DE PUBLICACIÓN */}

      <div className="card mb-4">
        <div className="card-body">

          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">

            <div>
              <h2 className="h6 fw-semibold mb-1">
                <i className="bi bi-cloud-arrow-up me-2" />
                Publicación web
              </h2>

              <p className="text-muted small mb-0">
                Genera y publica los cambios del sitio en GitHub.
              </p>
            </div>

            <div className="d-flex flex-wrap gap-2">

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={busy}
                onClick={generate}
              >
                <i className="bi bi-filetype-json me-2" />
                {generating
                  ? "Generando..."
                  : "Generar JSON"}
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={busy}
                onClick={checkGithub}
              >
                <i className="bi bi-github me-2" />
                {checking
                  ? "Comprobando..."
                  : "Comprobar GitHub"}
              </button>

              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={busy}
                onClick={prepare}
              >
                <i className="bi bi-rocket-takeoff me-2" />
                {publishing
                  ? "Procesando..."
                  : "Publicar web"}
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* NOTIFICACIONES */}

      {notice && (
        <div
          className={`alert ${
            failed ? "alert-danger" : "alert-success"
          }`}
          role={failed ? "alert" : "status"}
        >
          {notice}
        </div>
      )}

      {/* RESULTADO COMPROBACIÓN GITHUB */}

      {github && (
        <GithubSummary value={github} />
      )}

      {/* RESUMEN PREVIO DE PUBLICACIÓN */}

      {preparation && (
        <div
          className={`alert ${
            preparation.ok
              ? "alert-info"
              : "alert-danger"
          }`}
          role={preparation.ok ? "status" : "alert"}
        >
          <h2 className="h6 fw-semibold">
            Resumen previo de publicación
          </h2>

          <p>{preparation.message}</p>

          {preparation.branch && (
            <p>
              <strong>Rama:</strong>{" "}
              {preparation.branch}
            </p>
          )}

          {preparation.comparison && (
            <Comparison
              value={preparation.comparison}
            />
          )}

          <Warnings values={preparation.warnings} />

          {preparation.ok &&
            preparation.preparationToken && (
              <div className="d-flex flex-wrap gap-2 mt-3">

                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={publishing}
                  onClick={confirm}
                >
                  <i className="bi bi-check-circle me-2" />
                  {publishing
                    ? "Publicando..."
                    : "Confirmar publicación"}
                </button>

                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={publishing}
                  onClick={() => setPreparation(null)}
                >
                  Cancelar
                </button>

              </div>
            )}
        </div>
      )}

      {/* RESULTADO DE PUBLICACIÓN */}

      {publishResult && (
        <div
          className={`alert ${
            publishResult.ok
              ? "alert-success"
              : "alert-danger"
          }`}
          role={publishResult.ok ? "status" : "alert"}
        >
          <p className="mb-2">
            {publishResult.message}
          </p>

          {publishResult.commitUrl && (
            <a
              href={publishResult.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-success btn-sm"
            >
              <i className="bi bi-github me-2" />
              Ver commit en GitHub
            </a>
          )}

          {publishResult.code === "COMMITTED" && (
            <p className="small mt-2 mb-0">
              GitHub confirmó el commit. El despliegue
              posterior depende del proveedor configurado.
            </p>
          )}
        </div>
      )}

      {/* LISTADO ESTÁNDAR JIRO */}

      {!result.ok ? (
        <div className="alert alert-danger" role="alert">
          {result.message}
        </div>
      ) : (
        <ListView
          schema={webPagesSchema}
          title="Páginas web"
          data={result.data}
          toolbar={{
            create: true,
            search: true,
            import: false,
            export: false,
          }}
          onCreate={() => {
            router.push("/system/web-pages/new");
          }}
          onViewRow={(row) => {
            router.push(
              `/system/web-editor/${encodeURIComponent(String(row.id))}`
            );
          }}
          onEditRow={(row) => {
            router.push(
              `/system/web-pages/${encodeURIComponent(String(row.id))}`
            );
          }}
        />
      )}

    </section>
  );
}

// =====================================================
// RESUMEN GITHUB
// =====================================================

function GithubSummary({
  value,
}: {
  value: GithubResult;
}) {
  return (
    <div
      className={`alert ${
        value.ok ? "alert-info" : "alert-danger"
      } mb-3`}
      role={value.ok ? "status" : "alert"}
    >
      <h2 className="h6 fw-semibold">
        <i className="bi bi-github me-2" />
        Estado de GitHub
      </h2>

      <p>{value.message}</p>

      {value.branch && (
        <p>
          <strong>Rama:</strong> {value.branch}
        </p>
      )}

      {value.comparison && (
        <Comparison value={value.comparison} />
      )}

      <Warnings values={value.warnings} />

      <p className="small text-muted mb-0 mt-2">
        Esta operación es solo de consulta.
        No se ha modificado GitHub.
      </p>
    </div>
  );
}

// =====================================================
// COMPARACIÓN DE PUBLICACIONES
// =====================================================

function Comparison({
  value,
}: {
  value: ComparisonData;
}) {
  return (
    <div className="small">

      <p className="mb-2">
        <strong>Páginas locales:</strong>{" "}
        {value.localPageCount}
        {" · "}
        <strong>Páginas remotas:</strong>{" "}
        {value.remotePageCount}
      </p>

      <p className="mb-1">
        <strong>Añadidas:</strong>{" "}
        {value.addedPaths.join(", ") || "Ninguna"}
      </p>

      <p className="mb-1">
        <strong>Modificadas:</strong>{" "}
        {value.updatedPaths.join(", ") || "Ninguna"}
      </p>

      <p className="mb-1">
        <strong>Eliminadas:</strong>{" "}
        {value.removedPaths.join(", ") || "Ninguna"}
      </p>

    </div>
  );
}

// =====================================================
// ADVERTENCIAS DE PUBLICACIÓN
// =====================================================

function Warnings({
  values,
}: {
  values: WarningData[];
}) {
  if (!values.length) return null;

  return (
    <div className="mt-3">
      <h3 className="h6">
        Advertencias
      </h3>

      <ul className="small mb-0">
        {values.map((warning, index) => (
          <li key={`${warning.path}-${warning.url}-${index}`}>
            <strong>{warning.path}</strong>
            {": "}
            {warning.url}
            {" — "}
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

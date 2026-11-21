
"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import { Form } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import type { WebGlobalHeader } from "@repo/web-schema";

import {
  getWebSiteSettings,
  saveWebSiteSettings,
} from "@/actions/webSiteSettings";

type SettingsResult = Awaited<
  ReturnType<typeof getWebSiteSettings>
>;

type NavLink = {
  label: string;
  href: string;
};

const defaults: WebGlobalHeader = {
  enabled: false,
  brandText: "Jiro",
  homeHref: "/",
  links: [],
  backgroundColor: "#ffffff",
  color: "#172033",
  sticky: false,
};

// =====================================================
// ESQUEMA DEL FORMULARIO JIRO
// =====================================================

const settingsSchema: ModuleSchema = {
  db: {
    table: "web_site_settings",
    primaryKey: "id",
  },
  ui: {
    titleSingular: "Configuración web",
    icon: "bi bi-globe",
    color: "#245749",
    formSections: [
      {
        id: "identity",
        label: "Identidad",
        fields: [
          "enabled",
          "brandText",
          "logoSrc",
          "logoAlt",
          "homeHref",
        ],
      },
      {
        id: "appearance",
        label: "Apariencia",
        fields: [
          "backgroundColor",
          "color",
          "alignment",
        ],
      },
      {
        id: "dimensions",
        label: "Dimensiones",
        fields: [
          "minHeight",
          "maxWidth",
          "paddingX",
          "paddingY",
        ],
      },
      {
        id: "behavior",
        label: "Comportamiento",
        fields: ["sticky"],
      },
      {
        id: "cta",
        label: "Llamada a la acción",
        fields: [
          "ctaEnabled",
          "ctaLabel",
          "ctaHref",
        ],
      },
    ],
  },
  fields: [
    {
      name: "enabled",
      label: "Mostrar Header global",
      type: "boolean",
    },
    {
      name: "brandText",
      label: "Nombre de la marca",
      type: "text",
      required: true,
    },
    {
      name: "logoSrc",
      label: "URL del logo",
      type: "text",
      ui: {
        help: "Ejemplo: /images/logo.png",
      },
    },
    {
      name: "logoAlt",
      label: "Texto alternativo del logo",
      type: "text",
    },
    {
      name: "homeHref",
      label: "Enlace de inicio",
      type: "text",
      required: true,
    },
    {
      name: "backgroundColor",
      label: "Color de fondo",
      type: "color",
    },
    {
      name: "color",
      label: "Color de texto",
      type: "color",
    },
    {
      name: "alignment",
      label: "Alineación",
      type: "select",
      options: ["start", "center", "end"],
    },
    {
      name: "minHeight",
      label: "Altura mínima (px)",
      type: "number",
    },
    {
      name: "maxWidth",
      label: "Ancho máximo (px)",
      type: "number",
    },
    {
      name: "paddingX",
      label: "Espaciado horizontal (px)",
      type: "number",
    },
    {
      name: "paddingY",
      label: "Espaciado vertical (px)",
      type: "number",
    },
    {
      name: "sticky",
      label: "Mantener Header al desplazarse",
      type: "boolean",
    },
    {
      name: "ctaEnabled",
      label: "Mostrar botón CTA",
      type: "boolean",
    },
    {
      name: "ctaLabel",
      label: "Texto del botón",
      type: "text",
    },
    {
      name: "ctaHref",
      label: "Enlace del botón",
      type: "text",
    },
  ],
};

// =====================================================
// ADAPTADORES JSON <-> FORMULARIO
// =====================================================

function toFormData(header: WebGlobalHeader) {
  return {
    id: 1,
    enabled: header.enabled !== false,
    brandText: header.brandText ?? "",
    logoSrc: header.logoSrc ?? "",
    logoAlt: header.logoAlt ?? "",
    homeHref: header.homeHref ?? "/",
    backgroundColor: header.backgroundColor ?? "#ffffff",
    color: header.color ?? "#172033",
    alignment: header.alignment ?? "end",
    minHeight: header.minHeight ?? 72,
    maxWidth: header.maxWidth ?? 1200,
    paddingX: header.paddingX ?? 24,
    paddingY: header.paddingY ?? 12,
    sticky: header.sticky ?? false,
    ctaEnabled: Boolean(header.cta),
    ctaLabel: header.cta?.label ?? "Contacto",
    ctaHref: header.cta?.href ?? "/contacto",
  };
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function optionalNumber(value: unknown) {
  if (value === "" || value == null) return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toHeader(
  values: Record<string, unknown>,
  links: NavLink[]
): WebGlobalHeader {
  return {
    enabled: values.enabled === true,
    brandText: String(values.brandText ?? "").trim(),
    homeHref: String(values.homeHref ?? "/").trim(),

    ...(optionalText(values.logoSrc)
      ? { logoSrc: optionalText(values.logoSrc) }
      : {}),

    ...(optionalText(values.logoAlt)
      ? { logoAlt: optionalText(values.logoAlt) }
      : {}),

    links: links.map((link) => ({
      label: link.label.trim(),
      href: link.href.trim(),
    })),

    backgroundColor:
      String(values.backgroundColor ?? "#ffffff"),

    color:
      String(values.color ?? "#172033"),

    alignment: values.alignment as
      | "start"
      | "center"
      | "end",

    minHeight: optionalNumber(values.minHeight),
    maxWidth: optionalNumber(values.maxWidth),
    paddingX: optionalNumber(values.paddingX),
    paddingY: optionalNumber(values.paddingY),

    sticky: values.sticky === true,

    ...(values.ctaEnabled === true
      ? {
          cta: {
            label: String(values.ctaLabel ?? "").trim(),
            href: String(values.ctaHref ?? "").trim(),
          },
        }
      : {}),
  };
}

// =====================================================
// COMPONENTE
// =====================================================

export default function WebSiteSettings({
  result,
}: {
  result: SettingsResult;
}) {
  const initialHeader = result.header ?? defaults;

  const [header, setHeader] =
    useState<WebGlobalHeader>(initialHeader);

  const [links, setLinks] = useState<NavLink[]>(
    initialHeader.links ?? []
  );

  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [notice, setNotice] = useState(
    result.message || ""
  );

  const [failed, setFailed] = useState(!result.ok);
  const savingRef = useRef(false);

  // ===================================================
  // NAVEGACIÓN
  // ===================================================

  function updateLink(
    index: number,
    field: keyof NavLink,
    value: string
  ) {
    setLinks((previous) =>
      previous.map((link, position) =>
        position === index
          ? { ...link, [field]: value }
          : link
      )
    );

    setDirty(true);
  }

  function addLink() {
    setLinks((previous) => [
      ...previous,
      { label: "", href: "/" },
    ]);

    setDirty(true);
  }

  function removeLink(index: number) {
    setLinks((previous) =>
      previous.filter((_, position) => position !== index)
    );

    setDirty(true);
  }

  // ===================================================
  // GUARDADO
  // ===================================================

  async function save(values: Record<string, unknown>) {
    if (savingRef.current || !result.ok) return;

    savingRef.current = true;
    setBusy(true);
    setFailed(false);
    setNotice("");

    try {
      const payload = toHeader(values, links);
      const response = await saveWebSiteSettings(payload);

      setNotice(response.message);
      setFailed(!response.ok);

      if (response.ok) {
        setHeader(response.header);
        setLinks(response.header.links ?? []);
        setDirty(false);

        // Remonta Form con los valores confirmados.
        setVersion((previous) => previous + 1);
      }
    } catch {
      setFailed(true);
      setNotice("No se pudo guardar la configuración.");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  // ===================================================
  // INTERFAZ
  // ===================================================

  return (
    <section className="p-3">

      <div className="mb-4">
        <Link
          href="/system/web-pages"
          className="btn btn-outline-secondary btn-sm mb-3"
        >
          <i className="bi bi-arrow-left me-2" />
          Volver a páginas web
        </Link>

        <h1 className="h4 fw-semibold">
          <i className="bi bi-gear me-2" />
          Configuración del Header global
        </h1>

        <p className="text-muted">
          Define la cabecera que utilizarán las páginas
          que no tengan un Header personalizado.
        </p>
      </div>

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

      {!result.ok ? null : (
        <>
          {/* FORMULARIO GENERAL DE JIRO */}

          <Form
            key={version}
            schema={settingsSchema}
            initialData={toFormData(header)}
            recordId="1"
            moduleSlug="web_site_settings"
            mode="edit"
            readOnly={busy}
            onBack={() => {
              window.location.assign("/system/web-pages");
            }}
            onChange={() => setDirty(true)}
            onSubmit={(values) => {
              void save(values);
            }}
          />

          {/* NAVEGACIÓN */}
          {/* Se gestiona por separado porque Form no tiene
              un editor nativo de arrays de objetos. */}

          <div className="card mt-4">
            <div className="card-header d-flex justify-content-between align-items-center gap-2">
              <h2 className="h6 mb-0">
                Enlaces de navegación
              </h2>

              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={addLink}
                disabled={busy}
              >
                <i className="bi bi-plus-lg me-1" />
                Añadir enlace
              </button>
            </div>

            <div className="card-body">
              {links.length === 0 && (
                <p className="text-muted small mb-0">
                  Todavía no hay enlaces de navegación.
                </p>
              )}

              {links.map((link, index) => (
                <div
                  key={index}
                  className="row g-2 align-items-end mb-3"
                >
                  <div className="col-12 col-md-5">
                    <label className="form-label">
                      Texto
                    </label>

                    <input
                      className="form-control"
                      value={link.label}
                      disabled={busy}
                      onChange={(event) =>
                        updateLink(
                          index,
                          "label",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="col-12 col-md-5">
                    <label className="form-label">
                      Enlace
                    </label>

                    <input
                      className="form-control"
                      value={link.href}
                      disabled={busy}
                      onChange={(event) =>
                        updateLink(
                          index,
                          "href",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="col-12 col-md-2">
                    <button
                      type="button"
                      className="btn btn-outline-danger w-100"
                      onClick={() => removeLink(index)}
                      disabled={busy}
                    >
                      <i className="bi bi-trash" />
                      <span className="ms-2">Quitar</span>
                    </button>
                  </div>
                </div>
              ))}

              <p className="small text-muted mb-0">
                Los enlaces se guardan junto con el Header.
              </p>
            </div>
          </div>

          {dirty && (
            <p className="small text-warning mt-3">
              <i className="bi bi-exclamation-circle me-2" />
              Hay cambios pendientes de guardar.
            </p>
          )}
        </>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Field,
  FieldType,
  ListViewProps,
  getEffectiveModuleCapabilities,
  getFractalConfig,
  normalizeFieldConfig,
  validateFractalConfig,
} from "@repo/types";

import { ActionMenu } from "./ActionMenu";
import { getModuleColorVariables } from "./utils/colorContrast";
import { buildFractalForest, flattenFractal, fractalText } from "./fractalModel";
import { dataProvider } from "./providers/DataProvider";
import {
  collectRelationPendingKeys,
  getRelationDisplayConfig,
  getRelationDisplayResult,
  preloadRelationDisplayCache,
  renderRelationDisplay,
  type RelationDisplayEntry,
  type RelationDisplayStatusMap,
} from "./utils/relationDisplay";
import styles from "./FractalView.module.css";

export function FractalView({
  schema,
  data,
  loading,
  error,
  onRetry,
  title,
  onCreate,
  onViewRow,
  onEditRow,
  onDeleteRow,
  onExport,
  onImport,
  onSearch,
  exportLoading,
  importLoading,
  toolbar = {},
}: ListViewProps & { error?: string; onRetry?: () => void }) {
  const config = getFractalConfig(schema);
  const capabilities = getEffectiveModuleCapabilities(schema);
  const primaryKey = schema.db.primaryKey || "id";

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [relationCache, setRelationCache] = useState<
    Record<string, RelationDisplayEntry>
  >({});
  const [relationStatusByKey, setRelationStatusByKey] =
    useState<RelationDisplayStatusMap>({});

  const forest = useMemo(
    () => buildFractalForest(data, primaryKey, config.parentField || ""),
    [data, primaryKey, config.parentField]
  );

  const titleFieldName = config.titleField || primaryKey;

  const searchFields = [
    ...new Set([
      titleFieldName,
      ...(config.visibleFields || []),
    ]),
  ];

  const search = capabilities.allowSearch ? query : "";

  const visible = flattenFractal(
    forest,
    expanded,
    search,
    searchFields
  );

  const exportNodes = flattenFractal(
    forest,
    new Set(forest.nodes.keys()),
    search,
    searchFields
  );

  const problem = error || validateFractalConfig(schema);

  const palette = getModuleColorVariables(
    schema.ui?.color
  ) as CSSProperties;

  const icon = schema.ui?.icon;

  const tableFields = useMemo(() => {
    const fields = schema.fields || [];

    const byAppearance = fields.filter(field => {
      const normalized = normalizeFieldConfig(field);

      return (
        normalized.appearance === "List" ||
        normalized.appearance === "Always"
      );
    });

    const selected =
      byAppearance.length > 0
        ? byAppearance
        : fields.some(field => field.list === true)
          ? fields.filter(field => field.list === true)
          : fields.filter(field => field.visible !== false);

    return selected.filter(
      field =>
        field.name !== titleFieldName &&
        field.visible !== false
    );
  }, [schema.fields, titleFieldName]);

  const relationFields = useMemo(() => {
    const titleField = schema.fields.find(
      field => field.name === titleFieldName
    );

    const fields = [
      ...tableFields,
      ...(titleField ? [titleField] : []),
    ];

    return [
      ...new Map(
        fields.map(field => [field.name, field])
      ).values(),
    ].filter(
      field =>
        field.type === "selectorTabla" &&
        !!getRelationDisplayConfig(field)
    );
  }, [
    tableFields,
    schema.fields,
    titleFieldName,
  ]);

  const pendingRelationKeys = useMemo(
    () =>
      collectRelationPendingKeys({
        rows: data,
        fields: relationFields,
        getValue: (row, field) => row?.[field.name],
        cache: relationCache,
        statusByKey: relationStatusByKey,
      }),
    [
      data,
      relationFields,
      relationCache,
      relationStatusByKey,
    ]
  );

  useEffect(() => {
    if (!data?.length || !relationFields.length) return;

    let cancelled = false;

    void preloadRelationDisplayCache({
      rows: data,
      fields: relationFields,
      getValue: (row, field) => row?.[field.name],
      dataProvider,
      cache: relationCache,
      statusByKey: relationStatusByKey,
    })
      .then(({ patch, statusPatch }) => {
        if (cancelled) return;

        if (Object.keys(patch).length) {
          setRelationCache(prev => ({
            ...prev,
            ...patch,
          }));
        }

        if (Object.keys(statusPatch).length) {
          setRelationStatusByKey(prev => ({
            ...prev,
            ...statusPatch,
          }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, relationFields]);

  const toggle = (id: string) =>
    setExpanded(current => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const renderFieldValue = (
    row: any,
    fieldName: string
  ) => {
    const field = schema.fields.find(
      item => item.name === fieldName
    );

    if (!field) return "—";

    return renderCell(
      row?.[fieldName],
      field,
      relationCache,
      pendingRelationKeys,
      relationStatusByKey
    );
  };

  return (
    <section
      className={`Orymexa-list-view ${styles.view}`}
      style={palette}
      aria-label="Fractal"
      aria-busy={!!loading}
    >
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          {icon && (
            <i
              className={icon}
              style={{ fontSize: 40 }}
            />
          )}

          <div
            className="fw-semibold"
            style={{ fontSize: 14 }}
          >
            {title ||
              schema.ui?.titlePlural ||
              schema.db.table}
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {loading && (
            <span className="small text-muted">
              Cargando…
            </span>
          )}

          {toolbar.create !== false &&
            capabilities.allowCreate &&
            onCreate && (
              <button
                type="button"
                className="btn btn-sm Orymexa-list-action"
                onClick={onCreate}
                title="Crear"
                aria-label="Crear"
              >
                <i className="bi bi-plus-lg" />
              </button>
            )}

          {toolbar.search !== false &&
            capabilities.allowSearch &&
            onSearch && (
              <button
                type="button"
                className="btn btn-sm Orymexa-list-action"
                onClick={onSearch}
                title="Búsqueda avanzada"
                aria-label="Búsqueda avanzada"
              >
                <i className="bi bi-search" />
              </button>
            )}

          {toolbar.export !== false &&
            capabilities.allowExport &&
            onExport && (
              <button
                type="button"
                className="btn btn-sm Orymexa-list-action"
                disabled={
                  exportLoading ||
                  loading ||
                  !!problem
                }
                onClick={() =>
                  void onExport({
                    columns: [],
                    rows: [],
                    rawRows: exportNodes.map(
                      ({ node }) => node.row
                    ),
                  })
                }
                title={
                  exportLoading
                    ? "Exportando"
                    : "Exportar"
                }
                aria-label="Exportar"
              >
                <i className="bi bi-download" />
              </button>
            )}

          {toolbar.import !== false &&
            capabilities.allowImport &&
            onImport && (
              <button
                type="button"
                className="btn btn-sm Orymexa-list-action"
                disabled={importLoading}
                onClick={() => void onImport()}
                title={
                  importLoading
                    ? "Importando"
                    : "Importar"
                }
                aria-label="Importar"
              >
                <i className="bi bi-upload" />
              </button>
            )}
        </div>
      </div>

      <div className={`p-2 ${styles.toolbar}`}>
        {capabilities.allowSearch && (
          <input
            className={`form-control ${styles.search}`}
            type="search"
            aria-label="Buscar"
            placeholder="Buscar"
            value={query}
            onChange={e =>
              setQuery(e.target.value)
            }
          />
        )}

        <button
          type="button"
          className="btn btn-sm Orymexa-list-action"
          disabled={!!search}
          onClick={() =>
            setExpanded(
              new Set(forest.nodes.keys())
            )
          }
          title="Expandir todo"
          aria-label="Expandir todo"
        >
          <i className="bi bi-arrows-expand" />
        </button>

        <button
          type="button"
          className="btn btn-sm Orymexa-list-action"
          disabled={!!search}
          onClick={() =>
            setExpanded(new Set())
          }
          title="Contraer todo"
          aria-label="Contraer todo"
        >
          <i className="bi bi-arrows-collapse" />
        </button>
      </div>

      {loading ? (
        <p
          role="status"
          className="p-3"
        >
          Cargando registros…
        </p>
      ) : problem ? (
        <div
          role="alert"
          className="p-3 text-danger"
        >
          {problem}

          {onRetry && (
            <button
              type="button"
              className="btn btn-outline-secondary ms-2"
              onClick={onRetry}
            >
              Reintentar
            </button>
          )}
        </div>
      ) : (
        <>
          {!!(
            forest.cycles +
            forest.orphans +
            forest.duplicates +
            forest.invalid
          ) && (
            <p
              role="status"
              className="px-3 small text-muted"
            >
              Jerarquía ajustada:{" "}
              {forest.cycles} ciclos,{" "}
              {forest.orphans} padres fuera del lote,{" "}
              {forest.duplicates} duplicados omitidos y{" "}
              {forest.invalid} registros sin clave omitidos.
            </p>
          )}

          {!visible.length && (
            <p
              role="status"
              className="p-3"
            >
              No hay registros para mostrar.
            </p>
          )}

          {!!visible.length && (
            <div
              className={`table-responsive ${styles.tableWrapper}`}
            >
              <table
                className={`table table-sm mb-0 align-middle table-hover ${styles.treeTable}`}
              >
                <thead>
                  <tr>
                    <th
                      className={
                        styles.treeColumn
                      }
                    >
                      {schema.fields.find(
                        field =>
                          field.name ===
                          titleFieldName
                      )?.label || "Nombre"}
                    </th>

                    {tableFields.map(field => (
                      <th key={field.name}>
                        {field.label ||
                          field.name}
                      </th>
                    ))}

                    <th
                      className={
                        styles.actionsColumn
                      }
                    />
                  </tr>
                </thead>

                <tbody>
                  {visible.map(
                    ({ node, depth }) => {
                      const rawLabel =
                        node.row[
                          titleFieldName
                        ];

                      const labelText =
                        fractalText(
                          rawLabel
                        ) || "registro";

                      const renderedLabel =
                        renderFieldValue(
                          node.row,
                          titleFieldName
                        );

                      const isExpanded =
                        expanded.has(node.id) ||
                        !!search;

                      return (
                        <tr key={node.id}>
                          <td
                            className={
                              styles.treeCell
                            }
                          >
                            <div
                              className={
                                styles.treeCellInner
                              }
                              style={{
                                paddingInlineStart:
                                  Math.min(
                                    depth * 20,
                                    120
                                  ),
                              }}
                            >
                              {node.children
                                .length > 0 ? (
                                <button
                                  type="button"
                                  className={`btn btn-sm Orymexa-list-action ${styles.expandButton}`}
                                  aria-label={`${
                                    isExpanded
                                      ? "Contraer"
                                      : "Expandir"
                                  } ${labelText}`}
                                  aria-expanded={
                                    isExpanded
                                  }
                                  disabled={
                                    !!search
                                  }
                                  onClick={() =>
                                    toggle(
                                      node.id
                                    )
                                  }
                                >
                                  <i
                                    className={`bi bi-chevron-right ${
                                      isExpanded
                                        ? styles.expandIconOpen
                                        : ""
                                    }`}
                                  />
                                </button>
                              ) : (
                                <span
                                  className={
                                    styles.expandSpacer
                                  }
                                />
                              )}

                              <span
                                className={
                                  styles.treeLabel
                                }
                              >
                                {renderedLabel}
                              </span>
                            </div>
                          </td>

                          {tableFields.map(
                            field => (
                              <td
                                key={
                                  field.name
                                }
                              >
                                {renderFieldValue(
                                  node.row,
                                  field.name
                                )}
                              </td>
                            )
                          )}

                          <td className="text-end text-nowrap">
                            <ActionMenu
                              ariaLabel={`Acciones de ${labelText}`}
                              triggerClassName={`Orymexa-list-action ${styles.compactAction}`}
                              menuClassName="sidebar-module-menu"
                              menuStyle={palette}
                              items={[
                                onViewRow && {
                                  label: "Ver",
                                  icon: (
                                    <i className="bi bi-eye" />
                                  ),
                                  onClick:
                                    () =>
                                      onViewRow(
                                        node.row
                                      ),
                                },

                                capabilities.allowEdit &&
                                  onEditRow && {
                                    label:
                                      "Editar",
                                    icon: (
                                      <i className="bi bi-pencil" />
                                    ),
                                    onClick:
                                      () =>
                                        onEditRow(
                                          node.row
                                        ),
                                  },

                                capabilities.allowDelete &&
                                  onDeleteRow && {
                                    label:
                                      "Eliminar",
                                    icon: (
                                      <i className="bi bi-trash" />
                                    ),
                                    variant:
                                      "danger",
                                    onClick:
                                      () =>
                                        onDeleteRow(
                                          node.row
                                        ),
                                  },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function renderCell(
  value: any,
  field: Field,
  labelCache: Record<
    string,
    RelationDisplayEntry
  >,
  pendingKeys: Record<string, boolean>,
  relationStatusByKey: RelationDisplayStatusMap
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  switch (field.type as FieldType) {
    case "boolean":
      return value ? (
        <span className="badge bg-success-subtle text-success">
          Sí
        </span>
      ) : (
        <span className="badge bg-secondary-subtle text-muted">
          No
        </span>
      );

    case "date":
    case "datetime": {
      try {
        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
          return String(value);
        }

        if (field.type === "date") {
          return d
            .toISOString()
            .slice(0, 10);
        }

        return d.toLocaleString();
      } catch {
        return String(value);
      }
    }

    case "number":
    case "money":
    case "percent":
      return String(value);

    case "multiselect":
      if (Array.isArray(value)) {
        return value.join(", ");
      }

      return String(value);

    case "address":
      return typeof value === "string"
        ? value
        : String(
            value?.formatted || "—"
          );

    case "color":
      return (
        <div className="d-flex align-items-center gap-1">
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: 999,
              border:
                "1px solid rgba(0,0,0,0.1)",
              backgroundColor:
                String(value),
            }}
          />
        </div>
      );

    case "file":
    case "image":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          style={{
            textDecoration:
              "underline",
          }}
        >
          Ver
        </a>
      );

    case "selectorTabla": {
      const config =
        getRelationDisplayConfig(field);

      if (!config) {
        return String(value);
      }

      const result =
        getRelationDisplayResult({
          config,
          rawValue: value,
          cache: labelCache,
          pendingKeys,
          statusByKey:
            relationStatusByKey,
        });

      if (
        result.kind === "resolved"
      ) {
        return config.hasStyle
          ? renderRelationDisplay(
              result.entry.label,
              result.entry.icon,
              result.entry.color
            )
          : result.entry.label;
      }

      return result.text;
    }

    case "formula":
      return String(value);

    case "iconpicker":
      if (!value) return "—";

      return (
        <span className="d-inline-flex align-items-center gap-2">
          <i
            className={`bi ${value}`}
            aria-hidden="true"
          />
        </span>
      );

    default:
      return String(value);
  }
}
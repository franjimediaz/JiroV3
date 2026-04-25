"use client";

import { useEffect, useMemo, useState } from "react";

type BindingGroup = {
  label: string;
  options: Array<{ label: string; token: string }>;
};

type RelationDetail = {
  key: string;
  table: string;
  fields: string[];
};

type ResultAssistantConfig = {
  label: string;
  source: "related" | "table";
  relatedKey?: string;
  table?: string;
  field?: string;
  operation: "sum" | "avg" | "count" | "min" | "max";
  format: "currency" | "percent" | "number";
  filterField?: string;
  filterValue?: string;
};

type RelationAssistantConfig = {
  relationKey: string;
  fields: string[];
  mode: "table" | "cards" | "summary";
};

type TableAssistantConfig = {
  relationKey: string;
  columns: string[];
  totalField?: string;
  zebra: boolean;
  dense: boolean;
};

type BlockKind =
  | "header"
  | "text"
  | "divider"
  | "table"
  | "cards"
  | "totalsBox"
  | "business"
  | "chart"
  | "budgetPartidas";

type AssistantType = "text" | "result" | "relation" | "table" | null;

const assistantMeta: Record<Exclude<AssistantType, null>, { title: string; description: string; action: string }> = {
  text: {
    title: "Asistente de textos",
    description: "Cabeceras, pies y bloques con variables.",
    action: "Añadir bloque de texto",
  },
  result: {
    title: "Asistente de resultados",
    description: "Sumas, medias, conteos y totales.",
    action: "Crear resultado",
  },
  relation: {
    title: "Asistente de relaciones",
    description: "Tablas, tarjetas o resúmenes relacionados.",
    action: "Insertar relación",
  },
  table: {
    title: "Asistente de tablas",
    description: "Columnas, estilos y fila de total.",
    action: "Crear tabla",
  },
};

export default function PdfTemplateSidebar({
  readOnly,
  bindingGroups,
  relationDetails,
  tableOptions,
  fieldsByTable,
  onAddBlock,
  onCreateTextPreset,
  onCreateResultBlock,
  onCreateRelationBlock,
  onCreateTableBlock,
}: {
  readOnly: boolean;
  bindingGroups: BindingGroup[];
  relationDetails: RelationDetail[];
  tableOptions: string[];
  fieldsByTable: Record<string, string[]>;
  onAddBlock: (type: BlockKind) => void;
  onCreateTextPreset: (preset: {
    kind: "normal" | "variable" | "header" | "footer";
    token?: string;
  }) => void;
  onCreateResultBlock: (config: ResultAssistantConfig) => void;
  onCreateRelationBlock: (config: RelationAssistantConfig) => void;
  onCreateTableBlock: (config: TableAssistantConfig) => void;
}) {
  const [activeAssistant, setActiveAssistant] = useState<AssistantType>(null);

  const [textKind, setTextKind] = useState<"normal" | "variable" | "header" | "footer">("normal");
  const [textToken, setTextToken] = useState("");

  const [resultSource, setResultSource] = useState<"related" | "table">("related");
  const [resultRelatedKey, setResultRelatedKey] = useState(relationDetails[0]?.key ?? "");
  const [resultTable, setResultTable] = useState("");
  const [resultField, setResultField] = useState("");
  const [resultOperation, setResultOperation] = useState<ResultAssistantConfig["operation"]>("sum");
  const [resultLabel, setResultLabel] = useState("Total");
  const [resultFormat, setResultFormat] = useState<ResultAssistantConfig["format"]>("currency");
  const [resultFilterField, setResultFilterField] = useState("");
  const [resultFilterValue, setResultFilterValue] = useState("");

  const [relationKey, setRelationKey] = useState(relationDetails[0]?.key ?? "");
  const [relationMode, setRelationMode] = useState<RelationAssistantConfig["mode"]>("table");
  const [relationFields, setRelationFields] = useState<string[]>([]);

  const [tableRelationKey, setTableRelationKey] = useState(relationDetails[0]?.key ?? "");
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tableTotalField, setTableTotalField] = useState("");
  const [tableZebra, setTableZebra] = useState(true);
  const [tableDense, setTableDense] = useState(false);

  const variableOptions = useMemo(
    () => bindingGroups.flatMap((group) => group.options),
    [bindingGroups],
  );
  const resultFields = resultSource === "table"
    ? fieldsByTable[resultTable] ?? []
    : relationDetails.find((relation) => relation.key === resultRelatedKey)?.fields ?? [];
  const selectedRelationFields =
    relationDetails.find((relation) => relation.key === relationKey)?.fields ?? [];
  const selectedTableRelationFields =
    relationDetails.find((relation) => relation.key === tableRelationKey)?.fields ?? [];

  const textDisabled = readOnly || (textKind === "variable" && !textToken);
  const resultDisabled =
    readOnly ||
    !resultLabel.trim() ||
    (resultSource === "related" && !resultRelatedKey) ||
    (resultSource === "table" && !resultTable) ||
    (resultOperation !== "count" && !resultField);
  const relationDisabled = readOnly || !relationKey || relationFields.length === 0;
  const tableDisabled = readOnly || !tableRelationKey || tableColumns.length === 0;

  useEffect(() => {
    if (!activeAssistant) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveAssistant(null);
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeAssistant]);

  const toggleField = (
    current: string[],
    field: string,
    onChange: (next: string[]) => void,
  ) => {
    if (current.includes(field)) {
      onChange(current.filter((item) => item !== field));
      return;
    }
    onChange([...current, field]);
  };

  const closeAssistant = () => setActiveAssistant(null);

  const handleAssistantAction = () => {
    if (readOnly || !activeAssistant) return;

    if (activeAssistant === "text") {
      if (textDisabled) return;
      onCreateTextPreset({ kind: textKind, token: textToken || variableOptions[0]?.token });
      closeAssistant();
      return;
    }

    if (activeAssistant === "result") {
      if (resultDisabled) return;
      onCreateResultBlock({
        label: resultLabel,
        source: resultSource,
        relatedKey: resultRelatedKey,
        table: resultTable,
        field: resultField,
        operation: resultOperation,
        format: resultFormat,
        filterField: resultFilterField,
        filterValue: resultFilterValue,
      });
      closeAssistant();
      return;
    }

    if (activeAssistant === "relation") {
      if (relationDisabled) return;
      onCreateRelationBlock({
        relationKey,
        fields: relationFields,
        mode: relationMode,
      });
      closeAssistant();
      return;
    }

    if (activeAssistant === "table") {
      if (tableDisabled) return;
      onCreateTableBlock({
        relationKey: tableRelationKey,
        columns: tableColumns,
        totalField: tableTotalField,
        zebra: tableZebra,
        dense: tableDense,
      });
      closeAssistant();
    }
  };

  const actionDisabled =
    activeAssistant === "text" ? textDisabled :
    activeAssistant === "result" ? resultDisabled :
    activeAssistant === "relation" ? relationDisabled :
    activeAssistant === "table" ? tableDisabled :
    true;

  const renderAssistantContent = () => {
    if (activeAssistant === "text") {
      return (
        <>
          <div className="mb-2">
            <label className="form-label">Tipo</label>
            <select
              className="form-select"
              value={textKind}
              disabled={readOnly}
              onChange={(e) => setTextKind(e.target.value as typeof textKind)}
            >
              <option value="normal">Texto normal</option>
              <option value="variable">Texto con variable</option>
              <option value="header">Cabecera de documento</option>
              <option value="footer">Pie de página</option>
            </select>
          </div>

          {textKind === "variable" && (
            <div className="mb-3">
              <label className="form-label">Variable</label>
              <select
                className="form-select"
                value={textToken}
                disabled={readOnly}
                onChange={(e) => setTextToken(e.target.value)}
              >
                <option value="">Selecciona una variable</option>
                {bindingGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.token} value={option.token}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </>
      );
    }

    if (activeAssistant === "result") {
      return (
        <div className="row g-2">
          <div className="col-12">
            <label className="form-label">Etiqueta visible</label>
            <input
              className="form-control"
              value={resultLabel}
              disabled={readOnly}
              onChange={(e) => setResultLabel(e.target.value)}
            />
          </div>
          <div className="col-6">
            <label className="form-label">Origen</label>
            <select
              className="form-select"
              value={resultSource}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value as "related" | "table";
                setResultSource(next);
                setResultField("");
              }}
            >
              <option value="related">Relación</option>
              <option value="table">Tabla</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">{resultSource === "table" ? "Tabla" : "Relación"}</label>
            {resultSource === "table" ? (
              <select
                className="form-select"
                value={resultTable}
                disabled={readOnly}
                onChange={(e) => {
                  setResultTable(e.target.value);
                  setResultField("");
                }}
              >
                <option value="">Selecciona una tabla</option>
                {tableOptions.map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="form-select"
                value={resultRelatedKey}
                disabled={readOnly}
                onChange={(e) => {
                  setResultRelatedKey(e.target.value);
                  setResultField("");
                }}
              >
                <option value="">Selecciona una relación</option>
                {relationDetails.map((relation) => (
                  <option key={relation.key} value={relation.key}>
                    {relation.key} ({relation.table})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="col-6">
            <label className="form-label">Operación</label>
            <select
              className="form-select"
              value={resultOperation}
              disabled={readOnly}
              onChange={(e) => setResultOperation(e.target.value as ResultAssistantConfig["operation"])}
            >
              <option value="sum">Suma</option>
              <option value="avg">Media</option>
              <option value="count">Conteo</option>
              <option value="min">Mínimo</option>
              <option value="max">Máximo</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Formato</label>
            <select
              className="form-select"
              value={resultFormat}
              disabled={readOnly}
              onChange={(e) => setResultFormat(e.target.value as ResultAssistantConfig["format"])}
            >
              <option value="currency">Moneda</option>
              <option value="number">Número</option>
              <option value="percent">Porcentaje</option>
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Campo numérico</label>
            <select
              className="form-select"
              value={resultField}
              disabled={readOnly || resultOperation === "count"}
              onChange={(e) => setResultField(e.target.value)}
            >
              <option value="">{resultOperation === "count" ? "No necesario para conteo" : "Selecciona un campo"}</option>
              {resultFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Filtro opcional</label>
            <select
              className="form-select"
              value={resultFilterField}
              disabled={readOnly}
              onChange={(e) => setResultFilterField(e.target.value)}
            >
              <option value="">Sin filtro</option>
              {resultFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Valor filtro</label>
            <input
              className="form-control"
              value={resultFilterValue}
              disabled={readOnly || !resultFilterField}
              onChange={(e) => setResultFilterValue(e.target.value)}
            />
          </div>
        </div>
      );
    }

    if (activeAssistant === "relation") {
      return (
        <>
          <div className="mb-2">
            <label className="form-label">Relación</label>
            <select
              className="form-select"
              value={relationKey}
              disabled={readOnly}
              onChange={(e) => {
                setRelationKey(e.target.value);
                setRelationFields([]);
              }}
            >
              <option value="">Selecciona una relación</option>
              {relationDetails.map((relation) => (
                <option key={relation.key} value={relation.key}>
                  {relation.key} ({relation.table})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-2">
            <label className="form-label">Modo visual</label>
            <select
              className="form-select"
              value={relationMode}
              disabled={readOnly}
              onChange={(e) => setRelationMode(e.target.value as RelationAssistantConfig["mode"])}
            >
              <option value="table">Tabla</option>
              <option value="cards">Tarjetas</option>
              <option value="summary">Resumen</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label">Campos visibles</label>
            <div className="d-flex flex-wrap gap-2">
              {selectedRelationFields.map((field) => (
                <button
                  key={field}
                  type="button"
                  className={`btn btn-sm ${relationFields.includes(field) ? "btn-primary" : "btn-outline-secondary"}`}
                  disabled={readOnly}
                  onClick={() => toggleField(relationFields, field, setRelationFields)}
                >
                  {field}
                </button>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (activeAssistant === "table") {
      return (
        <>
          <div className="mb-2">
            <label className="form-label">Relación</label>
            <select
              className="form-select"
              value={tableRelationKey}
              disabled={readOnly}
              onChange={(e) => {
                setTableRelationKey(e.target.value);
                setTableColumns([]);
                setTableTotalField("");
              }}
            >
              <option value="">Selecciona una relación</option>
              {relationDetails.map((relation) => (
                <option key={relation.key} value={relation.key}>
                  {relation.key} ({relation.table})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-2">
            <label className="form-label">Columnas</label>
            <div className="d-flex flex-wrap gap-2">
              {selectedTableRelationFields.map((field) => (
                <button
                  key={field}
                  type="button"
                  className={`btn btn-sm ${tableColumns.includes(field) ? "btn-primary" : "btn-outline-secondary"}`}
                  disabled={readOnly}
                  onClick={() => toggleField(tableColumns, field, setTableColumns)}
                >
                  {field}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label">Campo total opcional</label>
            <select
              className="form-select"
              value={tableTotalField}
              disabled={readOnly}
              onChange={(e) => setTableTotalField(e.target.value)}
            >
              <option value="">Sin fila total</option>
              {selectedTableRelationFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>

          <div className="d-flex gap-3 mt-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={tableZebra}
                onChange={(e) => setTableZebra(e.target.checked)}
                disabled={readOnly}
              />
              <label className="form-check-label">Zebra</label>
            </div>
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={tableDense}
                onChange={(e) => setTableDense(e.target.checked)}
                disabled={readOnly}
              />
              <label className="form-check-label">Dense</label>
            </div>
          </div>
        </>
      );
    }

    return null;
  };

  const activeMeta = activeAssistant ? assistantMeta[activeAssistant] : null;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="fw-semibold mb-2">Elementos disponibles</div>
          <div className="d-flex flex-wrap gap-2">
            {[
              ["header", "Cabecera"],
              ["text", "Texto"],
              ["divider", "Separador"],
              ["table", "Tabla"],
              ["cards", "Tarjetas"],
              ["totalsBox", "Resultados"],
              ["business", "Negocio"],
              ["chart", "Gráfico"],
              ["budgetPartidas", "Partidas"],
            ].map(([type, label]) => (
              <button
                key={type}
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={readOnly}
                onClick={() => onAddBlock(type as BlockKind)}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="fw-semibold">Asistentes</div>
          <div className="text-muted small mb-3">
            Crea bloques del PDF sin editar JSON manualmente.
          </div>

          <div className="list-group">
            {(["text", "result", "relation", "table"] as const).map((assistant) => (
              <button
                key={assistant}
                type="button"
                className="list-group-item list-group-item-action"
                disabled={readOnly}
                onClick={() => setActiveAssistant(assistant)}
              >
                <div className="fw-semibold">{assistantMeta[assistant].title}</div>
                <div className="small text-muted">{assistantMeta[assistant].description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeAssistant && activeMeta && (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-assistant-title"
            tabIndex={-1}
            onMouseDown={closeAssistant}
          >
            <div className="modal-dialog modal-lg modal-dialog-scrollable" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h5 id="pdf-assistant-title" className="modal-title">
                      {activeMeta.title}
                    </h5>
                    <div className="text-muted small">{activeMeta.description}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Cerrar"
                    onClick={closeAssistant}
                  />
                </div>

                <div className="modal-body">{renderAssistantContent()}</div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={closeAssistant}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={actionDisabled}
                    onClick={handleAssistantAction}
                  >
                    {activeMeta.action}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onMouseDown={closeAssistant} />
        </>
      )}
    </div>
  );
}

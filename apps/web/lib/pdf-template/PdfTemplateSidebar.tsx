"use client";

import { useMemo, useState } from "react";

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
          <div className="fw-semibold">Asistente de textos</div>
          <div className="text-muted small mb-3">
            Crea cabeceras, textos estáticos y bloques con variables sin tocar JSON.
          </div>

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

          <button
            type="button"
            className="btn btn-primary w-100"
            disabled={readOnly || (textKind === "variable" && !textToken)}
            onClick={() => onCreateTextPreset({ kind: textKind, token: textToken || variableOptions[0]?.token })}
          >
            Añadir bloque de texto
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="fw-semibold">Asistente de resultados</div>
          <div className="text-muted small mb-3">
            Genera sumas, medias, conteos o totales usando datasets y un bloque listo para imprimir.
          </div>

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

          <button
            type="button"
            className="btn btn-primary w-100 mt-3"
            disabled={
              readOnly ||
              !resultLabel.trim() ||
              (resultSource === "related" && !resultRelatedKey) ||
              (resultSource === "table" && !resultTable) ||
              (resultOperation !== "count" && !resultField)
            }
            onClick={() =>
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
              })
            }
          >
            Crear resultado
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="fw-semibold">Asistente de relaciones</div>
          <div className="text-muted small mb-3">
            Inserta datos relacionados como tabla, tarjetas o resumen.
          </div>

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

          <button
            type="button"
            className="btn btn-primary w-100"
            disabled={readOnly || !relationKey || relationFields.length === 0}
            onClick={() =>
              onCreateRelationBlock({
                relationKey,
                fields: relationFields,
                mode: relationMode,
              })
            }
          >
            Insertar relación
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="fw-semibold">Asistente de tablas</div>
          <div className="text-muted small mb-3">
            Crea una tabla lista para PDF con columnas, estilo y fila de total opcional.
          </div>

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

          <button
            type="button"
            className="btn btn-primary w-100 mt-3"
            disabled={readOnly || !tableRelationKey || tableColumns.length === 0}
            onClick={() =>
              onCreateTableBlock({
                relationKey: tableRelationKey,
                columns: tableColumns,
                totalField: tableTotalField,
                zebra: tableZebra,
                dense: tableDense,
              })
            }
          >
            Crear tabla
          </button>
        </div>
      </div>
    </div>
  );
}

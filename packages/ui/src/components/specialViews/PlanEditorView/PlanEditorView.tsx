"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataProvider } from "../../../engines/computeEngine";
import PlanCanvas, { type PlanCanvasHandle } from "./PlanCanvas";
import PlanLayersPanel from "./PlanLayersPanel";
import PlanPropertiesPanel from "./PlanPropertiesPanel";
import PlanSettingsPanel from "./PlanSettingsPanel";
import PlanSymbolsPanel from "./PlanSymbolsPanel";
import PlanToolbar from "./PlanToolbar";
import type { LinkTargetRecord } from "./planDataSources";
import { loadDefaultLayers, loadLinkTargetRecords, loadPlanSymbols } from "./planDataSources";
import { exportPlanPdf, exportPlanPng } from "./planExport";
import styles from "./PlanEditorView.module.css";
import type { PlanDocument, PlanEditorConfig, PlanLinkTargetConfig, PlanObject, PlanSymbolDefinition, PlanTool, PlanUnit } from "./planTypes";
import { calibrateScaleFromLine, createDefaultPlanData, insertPointInPolygonSegment, isPlanObjectEditable, normalizePlanData, removePlanObject, shouldInitializeDefaultLayers, updatePlanObject } from "./planUtils";
import { usePlanHistory } from "./usePlanHistory";

type Props = {
  config: PlanEditorConfig;
  value: unknown;
  mode: "view" | "edit" | "create";
  dataProvider?: DataProvider;
  record?: Record<string, unknown>;
  onChange: (next: PlanDocument) => void;
};

export default function PlanEditorView({ config, value, mode, dataProvider, record, onChange }: Props) {
  const readOnly = mode === "view";
  const canvasRef = useRef<PlanCanvasHandle | null>(null);
  const [tool, setTool] = useState<PlanTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<PlanSymbolDefinition | null>(null);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [symbols, setSymbols] = useState<PlanSymbolDefinition[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [defaultLayers, setDefaultLayers] = useState<PlanDocument["layers"]>([]);
  const [defaultLayersLoading, setDefaultLayersLoading] = useState(false);
  const [linkRecords, setLinkRecords] = useState<LinkTargetRecord[]>([]);
  const [linkRecordsLoading, setLinkRecordsLoading] = useState(false);
  const [calibrationActive, setCalibrationActive] = useState(false);

  const document = useMemo(() => normalizePlanData(value, config.options), [value, config.options]);
  const history = usePlanHistory(document, onChange);
  const selectedObject = useMemo(
    () => document.objects.find((object) => object.id === selectedId) || null,
    [document.objects, selectedId]
  );

  const updateSelection = (ids: string[], activeId: string | null = ids[0] || null) => {
    setSelectedObjectIds(ids);
    setSelectedId(activeId);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const source = config.options?.symbolsSource;
      if (!source?.enabled) {
        setSymbols([]);
        setSymbolsError(null);
        setSymbolsLoading(false);
        return;
      }

      setSymbolsLoading(true);
      setSymbolsError(null);
      try {
        const nextSymbols = await loadPlanSymbols(source, dataProvider);
        if (!cancelled) setSymbols(nextSymbols);
      } catch (error) {
        if (!cancelled) setSymbolsError((error as Error)?.message || "No se pudieron cargar los simbolos.");
      } finally {
        if (!cancelled) setSymbolsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [config.options?.symbolsSource, dataProvider]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const source = config.options?.defaultLayersSource;
      if (!source?.enabled) {
        setDefaultLayers([]);
        setDefaultLayersLoading(false);
        return;
      }

      setDefaultLayersLoading(true);
      try {
        const layers = await loadDefaultLayers(source, dataProvider);
        if (!cancelled) setDefaultLayers(layers);
      } catch {
        if (!cancelled) setDefaultLayers([]);
      } finally {
        if (!cancelled) setDefaultLayersLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [config.options?.defaultLayersSource, dataProvider]);

  useEffect(() => {
    if (readOnly) return;
    if (!config.sourceField || value !== undefined && value !== null && value !== "") return;
    if (config.options?.defaultLayersSource?.enabled && defaultLayersLoading) return;
    history.pushHistory(createDefaultPlanData(config.options, shouldInitializeDefaultLayers(value) ? defaultLayers : []));
  }, [config.options, config.sourceField, defaultLayers, defaultLayersLoading, onChange, readOnly, value]);

  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey));
      if (isUndo) {
        event.preventDefault();
        history.undo();
      }
      if (isRedo) {
        event.preventDefault();
        history.redo();
      }
      if (event.key === "Escape" && editingPolygonId) {
        event.preventDefault();
        setEditingPolygonId(null);
        setSelectedVertexIndex(null);
      }
      if (event.key === "Escape" && !editingPolygonId) {
        event.preventDefault();
        updateSelection([]);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedObjectIds.length) {
        event.preventDefault();
        history.pushHistory({
          ...document,
          objects: document.objects.filter((object) => !selectedObjectIds.includes(object.id) || !isPlanObjectEditable(document, object, readOnly)),
        });
        updateSelection([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [document, editingPolygonId, history, readOnly, selectedObjectIds]);

  useEffect(() => {
    if (selectedId && !document.objects.some((object) => object.id === selectedId)) {
      setSelectedId(null);
    }
    setSelectedObjectIds((ids) => ids.filter((id) => document.objects.some((object) => object.id === id)));
    if (editingPolygonId && (!selectedId || selectedId !== editingPolygonId)) {
      setEditingPolygonId(null);
      setSelectedVertexIndex(null);
    }
  }, [document.objects, editingPolygonId, selectedId]);

  useEffect(() => {
    if (tool !== "select" && editingPolygonId) {
      setEditingPolygonId(null);
      setSelectedVertexIndex(null);
    }
  }, [editingPolygonId, tool]);

  const deleteSelected = () => {
    if (readOnly || (!selectedId && !selectedObjectIds.length)) return;
    if (selectedObjectIds.length > 1) {
      history.pushHistory({
        ...document,
        objects: document.objects.filter((object) => !selectedObjectIds.includes(object.id) || !isPlanObjectEditable(document, object, readOnly)),
      });
      updateSelection([]);
      return;
    }
    const selected = document.objects.find((object) => object.id === selectedId);
    const layer = selected ? document.layers.find((item) => item.id === selected.layerId) : null;
    if (selected?.locked || layer?.locked) return;
    if (!selectedId) return;
    history.pushHistory(removePlanObject(document, selectedId));
    updateSelection([]);
  };

  const clearPlan = () => {
    if (readOnly) return;
    history.pushHistory({
      ...createDefaultPlanData(config.options, defaultLayers),
      canvas: document.canvas,
      background: document.background,
      layers: document.layers,
      activeLayerId: document.activeLayerId,
    });
    updateSelection([]);
  };

  const updateSelected = (patch: Partial<PlanObject>) => {
    if (readOnly || !selectedId) return;
    history.pushHistory(updatePlanObject(document, selectedId, patch));
  };

  const movePolygonVertex = (objectId: string, vertexIndex: number, point: { x: number; y: number }) => {
    const object = document.objects.find((item) => item.id === objectId);
    if (!object || object.type !== "polygon") return;
    history.pushHistory(updatePlanObject(document, objectId, {
      points: object.points.map((item, index) => (index === vertexIndex ? point : item)),
    } as Partial<PlanObject>));
  };

  const addPolygonVertex = () => {
    if (!selectedObject || selectedObject.type !== "polygon" || readOnly) return;
    const insertAfter = selectedVertexIndex !== null ? selectedVertexIndex : selectedObject.points.length - 1;
    const current = selectedObject.points[insertAfter] || selectedObject.points[selectedObject.points.length - 1];
    const next = selectedObject.points[(insertAfter + 1) % selectedObject.points.length] || selectedObject.points[0];
    const newPoint = { x: Math.round((current.x + next.x) / 2), y: Math.round((current.y + next.y) / 2) };
    const points = [...selectedObject.points.slice(0, insertAfter + 1), newPoint, ...selectedObject.points.slice(insertAfter + 1)];
    setSelectedVertexIndex(insertAfter + 1);
    history.pushHistory(updatePlanObject(document, selectedObject.id, { points } as Partial<PlanObject>));
  };

  const deletePolygonVertex = () => {
    if (!selectedObject || selectedObject.type !== "polygon" || readOnly || selectedVertexIndex === null) return;
    if (selectedObject.points.length <= 3) return;
    const points = selectedObject.points.filter((_, index) => index !== selectedVertexIndex);
    setSelectedVertexIndex(Math.min(selectedVertexIndex, points.length - 1));
    history.pushHistory(updatePlanObject(document, selectedObject.id, { points } as Partial<PlanObject>));
  };

  const insertPolygonVertex = (objectId: string, segmentIndex: number, point: { x: number; y: number }) => {
    const object = document.objects.find((item) => item.id === objectId);
    if (!object || object.type !== "polygon" || readOnly || !isPlanObjectEditable(document, object, readOnly)) return;
    const points = insertPointInPolygonSegment(object.points, segmentIndex, point);
    setSelectedVertexIndex(segmentIndex + 1);
    history.pushHistory(updatePlanObject(document, object.id, { points } as Partial<PlanObject>));
  };

  const calibrateFromLine = (lineId: string, realLength: number, unit: PlanUnit) => {
    const line = document.objects.find((object) => object.id === lineId);
    if (!line || line.type !== "line") return;
    const scale = calibrateScaleFromLine(line, realLength, unit);
    history.pushHistory({ ...document, canvas: { ...document.canvas, scale } });
    setCalibrationActive(false);
  };

  const loadRecordsForTarget = async (target: PlanLinkTargetConfig, searchText?: string) => {
    setLinkRecordsLoading(true);
    try {
      setLinkRecords(await loadLinkTargetRecords(target, dataProvider, searchText));
    } catch {
      setLinkRecords([]);
    } finally {
      setLinkRecordsLoading(false);
    }
  };

  const handleToolChange = (nextTool: PlanTool) => {
    setTool(nextTool);
  };

  return (
    <div className={styles.shell}>
      <div className={styles.main}>
        <PlanToolbar
          tool={tool}
          readOnly={readOnly}
          hasSelection={!!selectedObject || selectedObjectIds.length > 0}
          hasActiveSymbol={!!activeSymbol}
          gridEnabled={document.canvas.grid.enabled}
          snapEnabled={document.canvas.grid.snap}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          calibrationActive={calibrationActive}
          onToolChange={handleToolChange}
          onDeleteSelected={deleteSelected}
          onClear={clearPlan}
          onUndo={history.undo}
          onRedo={history.redo}
          onToggleGrid={() => history.pushHistory({ ...document, canvas: { ...document.canvas, grid: { ...document.canvas.grid, enabled: !document.canvas.grid.enabled } } })}
          onToggleSnap={() => history.pushHistory({ ...document, canvas: { ...document.canvas, grid: { ...document.canvas.grid, snap: !document.canvas.grid.snap } } })}
          onToggleCalibration={() => {
            if (config.options?.calibration?.enabled === false) return;
            setCalibrationActive((current) => !current);
          }}
          onExportPng={() => exportPlanPng(canvasRef.current?.getStage() || null, `${config.sourceField || "plano"}.png`, { includeGrid: config.options?.export?.includeGrid === true })}
          onExportPdf={() => void exportPlanPdf(canvasRef.current?.getStage() || null, document, config.options, getExportSubtitle(config.options?.exportSubtitleField, record))}
        />

        <PlanCanvas
          ref={canvasRef}
          document={document}
          tool={readOnly ? "select" : tool}
          selectedId={selectedId}
          selectedIds={selectedObjectIds.length ? selectedObjectIds : selectedId ? [selectedId] : []}
          readOnly={readOnly}
          activeSymbol={activeSymbol}
          editingPolygonId={editingPolygonId}
          selectedVertexIndex={selectedVertexIndex}
          onChange={history.pushHistory}
          onSelect={(id) => updateSelection(id ? [id] : [], id)}
          onSelectionChange={updateSelection}
          onSelectVertex={setSelectedVertexIndex}
          onMovePolygonVertex={movePolygonVertex}
          onInsertPolygonVertex={insertPolygonVertex}
        />

        <div className={styles.meta}>
          <span>
            Canvas: {document.canvas.width} x {document.canvas.height}
          </span>
          <span>Unidad: {document.canvas.unit}</span>
          <span>Objetos: {document.objects.length}</span>
        </div>

        <PlanSettingsPanel
          document={document}
          readOnly={readOnly}
          uploader={config.options?.background?.uploader}
          calibration={config.options?.calibration}
          uploadFolder={`${config.sourceField || "plan-editor"}/background`}
          onChange={history.pushHistory}
        />
        <PlanLayersPanel document={document} readOnly={readOnly} onChange={history.pushHistory} />
      </div>

      <aside className={styles.sideStack}>
        <PlanSymbolsPanel
          symbols={symbols}
          loading={symbolsLoading}
          error={symbolsError}
          configured={!!config.options?.symbolsSource?.enabled}
          selectedSymbolId={activeSymbol?.id}
          readOnly={readOnly}
          onSelect={(symbol) => {
            setActiveSymbol(symbol);
            if (symbol) setTool("symbol");
          }}
        />
        <PlanPropertiesPanel
          object={selectedObject}
          layers={document.layers}
          scale={document.canvas.scale}
          linkTargets={config.options?.linkTargets || []}
          linkRecords={linkRecords}
          loadingLinkRecords={linkRecordsLoading}
          readOnly={readOnly || !isPlanObjectEditable(document, selectedObject, readOnly)}
          editingVertices={!!editingPolygonId && selectedObject?.id === editingPolygonId}
          selectedVertexIndex={selectedVertexIndex}
          calibrationActive={calibrationActive}
          calibration={config.options?.calibration}
          polygonValidationOptions={config.options?.polygonValidation}
          onChange={updateSelected}
          onLoadLinkRecords={loadRecordsForTarget}
          onToggleVertexEditing={() => {
            if (!selectedObject || selectedObject.type !== "polygon") return;
            setTool("select");
            setEditingPolygonId(editingPolygonId === selectedObject.id ? null : selectedObject.id);
            setSelectedVertexIndex(null);
          }}
          onSelectVertex={setSelectedVertexIndex}
          onAddVertex={addPolygonVertex}
          onDeleteVertex={deletePolygonVertex}
          onUseLineForCalibration={calibrateFromLine}
        />
      </aside>
    </div>
  );
}

function getExportSubtitle(field: string | undefined, record: Record<string, unknown> | undefined) {
  if (!field || !record) return "";
  const value = record[field];
  return value === null || value === undefined ? "" : String(value);
}

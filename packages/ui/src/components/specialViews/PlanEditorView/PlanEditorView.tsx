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
import type { PlanDocument, PlanEditorConfig, PlanLinkTargetConfig, PlanObject, PlanSymbolDefinition, PlanTool } from "./planTypes";
import { createDefaultPlanData, normalizePlanData, removePlanObject, updatePlanObject } from "./planUtils";

type Props = {
  config: PlanEditorConfig;
  value: unknown;
  mode: "view" | "edit" | "create";
  dataProvider?: DataProvider;
  onChange: (next: PlanDocument) => void;
};

export default function PlanEditorView({ config, value, mode, dataProvider, onChange }: Props) {
  const readOnly = mode === "view";
  const canvasRef = useRef<PlanCanvasHandle | null>(null);
  const [tool, setTool] = useState<PlanTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<PlanSymbolDefinition | null>(null);
  const [symbols, setSymbols] = useState<PlanSymbolDefinition[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [defaultLayers, setDefaultLayers] = useState<PlanDocument["layers"]>([]);
  const [defaultLayersLoading, setDefaultLayersLoading] = useState(false);
  const [linkRecords, setLinkRecords] = useState<LinkTargetRecord[]>([]);
  const [linkRecordsLoading, setLinkRecordsLoading] = useState(false);

  const document = useMemo(() => normalizePlanData(value, config.options), [value, config.options]);
  const selectedObject = useMemo(
    () => document.objects.find((object) => object.id === selectedId) || null,
    [document.objects, selectedId]
  );

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
    onChange(createDefaultPlanData(config.options, defaultLayers));
  }, [config.options, config.sourceField, defaultLayers, defaultLayersLoading, onChange, readOnly, value]);

  useEffect(() => {
    if (selectedId && !document.objects.some((object) => object.id === selectedId)) {
      setSelectedId(null);
    }
  }, [document.objects, selectedId]);

  const deleteSelected = () => {
    if (readOnly || !selectedId) return;
    const selected = document.objects.find((object) => object.id === selectedId);
    const layer = selected ? document.layers.find((item) => item.id === selected.layerId) : null;
    if (selected?.locked || layer?.locked) return;
    onChange(removePlanObject(document, selectedId));
    setSelectedId(null);
  };

  const clearPlan = () => {
    if (readOnly) return;
    onChange({
      ...createDefaultPlanData(config.options, defaultLayers),
      canvas: document.canvas,
      background: document.background,
      layers: document.layers,
      activeLayerId: document.activeLayerId,
    });
    setSelectedId(null);
  };

  const updateSelected = (patch: Partial<PlanObject>) => {
    if (readOnly || !selectedId) return;
    onChange(updatePlanObject(document, selectedId, patch));
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
          hasSelection={!!selectedObject}
          hasActiveSymbol={!!activeSymbol}
          onToolChange={handleToolChange}
          onDeleteSelected={deleteSelected}
          onClear={clearPlan}
          onExportPng={() => exportPlanPng(canvasRef.current?.getStage() || null, `${config.sourceField || "plano"}.png`)}
          onExportPdf={() => void exportPlanPdf(canvasRef.current?.getStage() || null, config.options?.exportTitle || "Plano")}
        />

        <PlanCanvas
          ref={canvasRef}
          document={document}
          tool={readOnly ? "select" : tool}
          selectedId={selectedId}
          readOnly={readOnly}
          activeSymbol={activeSymbol}
          onChange={onChange}
          onSelect={setSelectedId}
        />

        <div className={styles.meta}>
          <span>
            Canvas: {document.canvas.width} x {document.canvas.height}
          </span>
          <span>Unidad: {document.canvas.unit}</span>
          <span>Objetos: {document.objects.length}</span>
        </div>

        <PlanSettingsPanel document={document} readOnly={readOnly} onChange={onChange} />
        <PlanLayersPanel document={document} readOnly={readOnly} onChange={onChange} />
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
          linkTargets={config.options?.linkTargets || []}
          linkRecords={linkRecords}
          loadingLinkRecords={linkRecordsLoading}
          readOnly={readOnly}
          onChange={updateSelected}
          onLoadLinkRecords={loadRecordsForTarget}
        />
      </aside>
    </div>
  );
}

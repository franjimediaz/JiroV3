"use client";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import Konva from "konva";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import styles from "./PlanEditorView.module.css";
import type { PlanBlockDefinition, PlanDocument, PlanEditorOptions, PlanLineObject, PlanObject, PlanPolygonObject, PlanPolygonPoint, PlanRectObject, PlanSymbolDefinition, PlanTool } from "./planTypes";
import { getPlanIconInfo, getSymbolCanvasText } from "./planIconUtils";
import { isEditableHotkeyTarget } from "./planHotkeyUtils";
import { calculateLineMeasure, calculateTemporaryMeasurement, getObjectAreaLabel, createPlanObjectId, getObjectSnapPoints, getPlanLayer, getPolygonCentroid, getSelectionBounds, getSelectionSnapPoints, getSnapGuides, getVisiblePlanObjects, isPlanObjectEditable, insertPlanBlock, moveObjectByDelta, moveObjectsByDelta, objectIntersectsRect, applyObjectSnap, projectPointOnSegment, shouldSnap, snapPoint, updatePlanObject, validatePolygon, type PlanBounds, type SnapGuide } from "./planUtils";

type Props = {
  document: PlanDocument;
  tool: PlanTool;
  selectedId: string | null;
  selectedIds?: string[];
  readOnly?: boolean;
  activeSymbol: PlanSymbolDefinition | null;
  activeBlock?: PlanBlockDefinition | null;
  blockOptions?: PlanEditorOptions["blocks"];
  measurementOptions?: PlanEditorOptions["measurement"];
  editingPolygonId?: string | null;
  selectedVertexIndex?: number | null;
  onChange: (document: PlanDocument) => void;
  onSelect: (objectId: string | null) => void;
  onSelectionChange?: (objectIds: string[], activeObjectId?: string | null) => void;
  onSelectVertex?: (index: number | null) => void;
  onMovePolygonVertex?: (objectId: string, vertexIndex: number, point: PlanPolygonPoint) => void;
  onInsertPolygonVertex?: (objectId: string, segmentIndex: number, point: PlanPolygonPoint) => void;
};

type DraftObject = PlanLineObject | PlanRectObject | null;

export type PlanCanvasHandle = {
  getStage: () => Konva.Stage | null;
};

const PlanCanvas = forwardRef<PlanCanvasHandle, Props>(function PlanCanvas(
  { document, tool, selectedId, selectedIds = selectedId ? [selectedId] : [], readOnly, activeSymbol, activeBlock, blockOptions, measurementOptions, editingPolygonId, selectedVertexIndex, onChange, onSelect, onSelectionChange, onSelectVertex, onMovePolygonVertex, onInsertPolygonVertex },
  ref
) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Record<string, Konva.Node | null>>({});
  const [draft, setDraft] = useState<DraftObject>(null);
  const [draftPolygon, setDraftPolygon] = useState<PlanPolygonObject | null>(null);
  const [pointerPreview, setPointerPreview] = useState<PlanPolygonPoint | null>(null);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<PlanBounds | null>(null);
  const [selectionStart, setSelectionStart] = useState<PlanPolygonPoint | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [measurementStart, setMeasurementStart] = useState<PlanPolygonPoint | null>(null);
  const [measurementEnd, setMeasurementEnd] = useState<PlanPolygonPoint | null>(null);
  const [measurements, setMeasurements] = useState<Array<{ id: string; a: PlanPolygonPoint; b: PlanPolygonPoint }>>([]);
  const [zoom, setZoom] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const panningRef = useRef(false);
  const lastPanPointerRef = useRef<PlanPolygonPoint | null>(null);
  const backgroundImage = useImage(document.background?.url || "");
  const visibleObjects = useMemo(() => getVisiblePlanObjects(document), [document]);

  const selectedObject = useMemo(
    () => document.objects.find((object) => object.id === selectedId) || null,
    [document.objects, selectedId]
  );
  const editingPolygon = useMemo(
    () => document.objects.find((object): object is PlanPolygonObject => object.id === editingPolygonId && object.type === "polygon") || null,
    [document.objects, editingPolygonId]
  );
  const selectionBounds = useMemo(() => getSelectionBounds(visibleObjects, selectedIds), [visibleObjects, selectedIds]);
  const measurementEnabled = measurementOptions?.enabled !== false;
  const allowConvertMeasurement = measurementOptions?.allowConvertToLine !== false;
  const canPan = tool === "pan" || spacePressed;

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }), []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const selectedNode = selectedIds.length === 1 ? shapeRefs.current[selectedIds[0]] : null;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, document.objects]);

  const commitObject = (object: PlanObject) => {
    onChange({ ...document, objects: [...document.objects, object] });
    onSelect(object.id);
  };

  const updateObject = (objectId: string, patch: Partial<PlanObject>) => {
    onChange(updatePlanObject(document, objectId, patch));
  };

  const getPlanPointer = () => {
    const raw = stageRef.current?.getPointerPosition();
    if (!raw) return null;
    return { x: (raw.x - stagePosition.x) / zoom, y: (raw.y - stagePosition.y) / zoom };
  };

  const getSnapCandidates = (excludeIds: string[]) =>
    visibleObjects
      .filter((object) => !excludeIds.includes(object.id))
      .flatMap(getObjectSnapPoints);

  const snapDeltaForSelection = (ids: string[], dx: number, dy: number) => {
    if (!document.canvas.snap.enabled || !document.canvas.snap.toObjects) return { dx, dy, guides: [] as SnapGuide[] };
    const moved = document.objects.filter((object) => ids.includes(object.id)).map((object) => moveObjectByDelta(object, dx, dy));
    const sourcePoints = getSelectionSnapPoints(moved);
    const candidates = getSnapCandidates(ids);
    for (const point of sourcePoints) {
      const snapped = applyObjectSnap(point, candidates, document.canvas.snap.threshold / zoom);
      if (snapped.target) {
        return { dx: dx + snapped.dx, dy: dy + snapped.dy, guides: getSnapGuides({ x: point.x + snapped.dx, y: point.y + snapped.dy }, snapped.target) };
      }
    }
    return { dx, dy, guides: [] as SnapGuide[] };
  };

  const moveSelection = (ids: string[], dx: number, dy: number) => {
    const snapped = snapDeltaForSelection(ids, dx, dy);
    onChange({ ...document, objects: moveObjectsByDelta(document.objects, ids, snapped.dx, snapped.dy, { layers: document.layers, readOnly, groups: document.groups }) });
    setSnapGuides([]);
  };

  const previewMoveSelection = (ids: string[], dx: number, dy: number) => {
    setSnapGuides(snapDeltaForSelection(ids, dx, dy).guides);
  };

  const snapPointer = (point: PlanPolygonPoint, excludeIds: string[] = []) => {
    const gridPoint = normalizePointer(document, point);
    if (!document.canvas.snap.enabled || !document.canvas.snap.toObjects) {
      setSnapGuides([]);
      return gridPoint;
    }
    const snapped = applyObjectSnap(
      { ...gridPoint, kind: "pointer" },
      getSnapCandidates(excludeIds),
      document.canvas.snap.threshold / zoom
    );
    if (!snapped.target) {
      setSnapGuides([]);
      return gridPoint;
    }
    setSnapGuides(getSnapGuides(snapped.point, snapped.target));
    return snapped.point;
  };

  const handleStagePointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const nativeEvent = event.evt as MouseEvent;
    if (canPan || nativeEvent.button === 1) {
      const pointer = stageRef.current?.getPointerPosition();
      if (pointer) {
        panningRef.current = true;
        lastPanPointerRef.current = pointer;
        nativeEvent.preventDefault();
      }
      return;
    }
    if (readOnly) return;
    const stage = stageRef.current;
    const rawPoint = getPlanPointer();
    if (!rawPoint) return;
    const point = snapPointer(rawPoint);
    const activeLayer = getPlanLayer(document, document.activeLayerId);
    const canDrawOnLayer = !readOnly && activeLayer.visible !== false && !activeLayer.locked;

    if (event.target === stage && tool === "select") {
      setSelectionStart(point);
      setSelectionDraft({ x: point.x, y: point.y, width: 0, height: 0 });
      if (!(event.evt as MouseEvent).shiftKey) {
        onSelectionChange?.([], null);
        onSelect(null);
      }
      return;
    }

    if (!canDrawOnLayer) return;

    if (tool !== "polygon" && draftPolygon) {
      setDraftPolygon(null);
      setPointerPreview(null);
    }

    if (tool === "line") {
      setDraft({
        id: createPlanObjectId(),
        layerId: activeLayer.id,
        type: "line",
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        stroke: "#111827",
        strokeWidth: 3,
        label: "",
        showMeasure: true,
      });
      return;
    }

    if (tool === "rect") {
      setDraft({
        id: createPlanObjectId(),
        layerId: activeLayer.id,
        type: "rect",
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        stroke: "#111827",
        strokeWidth: 2,
        fill: "transparent",
        label: "",
        showArea: true,
      });
      return;
    }

    if (tool === "text") {
      commitObject({
        id: createPlanObjectId(),
        layerId: activeLayer.id,
        type: "text",
        x: point.x,
        y: point.y,
        text: "Texto",
        fontSize: 16,
        fill: "#111827",
      });
    }

    if (tool === "symbol" && activeSymbol) {
      commitObject({
        id: createPlanObjectId(),
        layerId: activeLayer.id,
        type: "symbol",
        x: point.x,
        y: point.y,
        symbolId: activeSymbol.id,
        symbolLabel: activeSymbol.label,
        symbolIcon: activeSymbol.icon,
        symbolColor: activeSymbol.color || "#111827",
        size: 34,
        source: activeSymbol.source,
      });
    }

    if (tool === "block" && activeBlock) {
      const result = insertPlanBlock(document, activeBlock.block, point, {
        insertIntoActiveLayer: blockOptions?.insertIntoActiveLayer !== false,
        preserveLinks: blockOptions?.preserveLinks === true,
      });
      onChange(result.document);
      onSelectionChange?.(result.objects.map((object) => object.id), result.objects[0]?.id || null);
      onSelect(result.objects[0]?.id || null);
      return;
    }

    if (tool === "measure" && measurementEnabled) {
      if (!measurementStart) {
        setMeasurementStart(point);
        setMeasurementEnd(point);
      } else {
        setMeasurements((current) => [...current, { id: createPlanObjectId(), a: measurementStart, b: point }]);
        setMeasurementStart(null);
        setMeasurementEnd(null);
      }
      return;
    }

    if (tool === "polygon") {
      if (!draftPolygon) {
        setDraftPolygon({
          id: createPlanObjectId(),
          layerId: activeLayer.id,
          type: "polygon",
          points: [point],
          stroke: "#111827",
          strokeWidth: 2,
          fill: "rgba(37, 99, 235, 0.12)",
          label: "Zona",
          showArea: true,
        });
        setPointerPreview(point);
        return;
      }

      setDraftPolygon({ ...draftPolygon, points: [...draftPolygon.points, point] });
      setPointerPreview(point);
    }
  };

  const handleStagePointerMove = () => {
    if (panningRef.current) {
      const pointer = stageRef.current?.getPointerPosition();
      const previous = lastPanPointerRef.current;
      if (pointer && previous) {
        setStagePosition((position) => ({
          x: position.x + pointer.x - previous.x,
          y: position.y + pointer.y - previous.y,
        }));
        lastPanPointerRef.current = pointer;
      }
      return;
    }
    if (readOnly) return;
    const rawPoint = getPlanPointer();
    if (!rawPoint) return;
    const point = snapPointer(rawPoint);

    if (selectionStart && selectionDraft) {
      setSelectionDraft(normalizeBounds(selectionStart, point));
      return;
    }

    if (measurementStart) {
      setMeasurementEnd(point);
      return;
    }

    if (draftPolygon) {
      setPointerPreview(point);
      return;
    }

    if (!draft) return;

    if (draft.type === "line") {
      setDraft({ ...draft, x2: point.x, y2: point.y });
      return;
    }

    setDraft({
      ...draft,
      width: point.x - draft.x,
      height: point.y - draft.y,
    });
  };

  const handleStagePointerUp = () => {
    if (panningRef.current) {
      panningRef.current = false;
      lastPanPointerRef.current = null;
      return;
    }

    if (selectionDraft) {
      const ids = visibleObjects.filter((object) => objectIntersectsRect(object, selectionDraft)).map((object) => object.id);
      onSelectionChange?.(ids, ids[0] || null);
      onSelect(ids[0] || null);
      setSelectionDraft(null);
      setSelectionStart(null);
      return;
    }

    if (readOnly || !draft) return;

    if (draft.type === "line") {
      const length = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
      if (length > 4) commitObject(draft);
      setDraft(null);
      return;
    }

    const rect = normalizeRectDraft(draft);
    if (rect.width > 4 && rect.height > 4) commitObject(rect);
    setDraft(null);
  };

  const convertLastMeasurementToLine = () => {
    if (readOnly || !allowConvertMeasurement || !measurements.length) return;
    const activeLayer = getPlanLayer(document, document.activeLayerId);
    if (activeLayer.visible === false || activeLayer.locked) return;
    const measurement = measurements[measurements.length - 1];
    onChange({
      ...document,
      objects: [
        ...document.objects,
        {
          id: createPlanObjectId(),
          layerId: activeLayer.id,
          type: "line",
          x1: measurement.a.x,
          y1: measurement.a.y,
          x2: measurement.b.x,
          y2: measurement.b.y,
          stroke: "#7c3aed",
          strokeWidth: 2,
          label: "Medicion",
          showMeasure: true,
        },
      ],
    });
    setMeasurements((current) => current.slice(0, -1));
  };

  const fitToScreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const padding = document.canvas.view.showRulers ? 96 : 64;
    const nextZoom = Math.max(
      0.25,
      Math.min(4, Math.min((wrap.clientWidth - padding) / document.canvas.width, (wrap.clientHeight - padding) / document.canvas.height))
    );
    setZoom(Number.isFinite(nextZoom) ? nextZoom : 1);
    setStagePosition({ x: 0, y: 0 });
  };

  const finishPolygon = () => {
    if (readOnly || !draftPolygon) return;
    if (draftPolygon.points.length >= 3) commitObject(draftPolygon);
    setDraftPolygon(null);
    setPointerPreview(null);
  };

  const cancelPolygon = () => {
    setDraftPolygon(null);
    setPointerPreview(null);
  };

  useEffect(() => {
    if (tool !== "polygon") cancelPolygon();
  }, [tool]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableHotkeyTarget(event.target)) return;
      if (readOnly || tool !== "polygon") return;
      if (event.key === "Enter") {
        event.preventDefault();
        finishPolygon();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPolygon();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draftPolygon, readOnly, tool]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (isEditableHotkeyTarget(event.target)) return;
      event.preventDefault();
      setSpacePressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const stopPanning = () => {
      panningRef.current = false;
      lastPanPointerRef.current = null;
    };
    window.addEventListener("mouseup", stopPanning);
    window.addEventListener("touchend", stopPanning);
    window.addEventListener("blur", stopPanning);
    return () => {
      window.removeEventListener("mouseup", stopPanning);
      window.removeEventListener("touchend", stopPanning);
      window.removeEventListener("blur", stopPanning);
    };
  }, []);

  return (
    <div ref={wrapRef} className={styles.canvasWrap}>
      {document.canvas.view.showRulers ? <PlanRulers document={document} zoom={zoom} /> : null}
      <div className={styles.stageInner}>
        <Stage
          ref={stageRef}
          width={document.canvas.width}
          height={document.canvas.height}
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
          onMouseMove={handleStagePointerMove}
          onTouchMove={handleStagePointerMove}
          onMouseUp={handleStagePointerUp}
          onTouchEnd={handleStagePointerUp}
          onDblClick={finishPolygon}
          onDblTap={finishPolygon}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePosition.x}
          y={stagePosition.y}
          onWheel={(event) => {
            if (!event.evt.ctrlKey && !event.evt.metaKey) return;
            event.evt.preventDefault();
            const pointer = stageRef.current?.getPointerPosition();
            const direction = event.evt.deltaY > 0 ? -1 : 1;
            const nextZoom = Math.max(0.25, Math.min(4, zoom + direction * 0.1));
            if (!pointer) {
              setZoom(nextZoom);
              return;
            }
            const mousePointTo = {
              x: (pointer.x - stagePosition.x) / zoom,
              y: (pointer.y - stagePosition.y) / zoom,
            };
            setZoom(nextZoom);
            setStagePosition({
              x: pointer.x - mousePointTo.x * nextZoom,
              y: pointer.y - mousePointTo.y * nextZoom,
            });
          }}
        >
          {backgroundImage ? (
            <Layer listening={false}>
              <KonvaImage
                image={backgroundImage}
                opacity={document.background?.opacity ?? 1}
                {...getBackgroundImageProps(document, backgroundImage)}
                listening={false}
              />
            </Layer>
          ) : null}
          {document.canvas.grid.enabled ? <GridLayer document={document} /> : null}
          <Layer>
            {visibleObjects.map((object) => renderObject({
              object,
              selected: selectedIds.includes(object.id),
              readOnly: readOnly || canPan || !isPlanObjectEditable(document, object, readOnly),
              scale: document.canvas.scale,
              document,
              setRef: (node) => {
                shapeRefs.current[object.id] = node;
              },
              onSelect,
              onSelectionChange,
              onMove: updateObject,
              selectedIds,
              onMoveSelection: moveSelection,
              onPreviewMoveSelection: previewMoveSelection,
              editing: object.id === editingPolygonId,
            }))}

            {draft ? renderObject({
              object: draft.type === "rect" ? normalizeRectDraft(draft) : draft,
              selected: false,
              readOnly: true,
              scale: document.canvas.scale,
              document,
              setRef: () => undefined,
              onSelect: () => undefined,
              onSelectionChange: undefined,
              onMove: () => undefined,
              selectedIds: [],
              onMoveSelection: () => undefined,
              onPreviewMoveSelection: () => undefined,
              editing: false,
            }) : null}

            {draftPolygon ? renderObject({
              object: {
                ...draftPolygon,
                points: pointerPreview && draftPolygon.points.length ? [...draftPolygon.points, pointerPreview] : draftPolygon.points,
              },
              selected: false,
              readOnly: true,
              scale: document.canvas.scale,
              document,
              setRef: () => undefined,
              onSelect: () => undefined,
              onSelectionChange: undefined,
              onMove: () => undefined,
              selectedIds: [],
              onMoveSelection: () => undefined,
              onPreviewMoveSelection: () => undefined,
              editing: false,
            }) : null}

            <Transformer
              ref={transformerRef}
              name="plan-editor-transformer"
              rotateEnabled={false}
              resizeEnabled={false}
              enabledAnchors={[]}
              borderStroke="#2563eb"
              borderDash={[6, 4]}
              ignoreStroke
              visible={!!selectedObject}
            />
            {selectionBounds && selectedIds.length > 1 ? (
              <Rect
                name="plan-editor-selection"
                x={selectionBounds.x}
                y={selectionBounds.y}
                width={selectionBounds.width}
                height={selectionBounds.height}
                stroke="#2563eb"
                dash={[6, 4]}
                listening={false}
              />
            ) : null}
            {selectionDraft ? (
              <Rect
                name="plan-editor-selection"
                x={selectionDraft.x}
                y={selectionDraft.y}
                width={selectionDraft.width}
                height={selectionDraft.height}
                stroke="#2563eb"
                fill="rgba(37,99,235,0.08)"
                dash={[5, 4]}
                listening={false}
              />
            ) : null}
            {document.canvas.view.showGuides ? snapGuides.map((guide, index) => (
              <Line
                key={index}
                name="plan-editor-guides"
                points={guide.orientation === "vertical" ? [guide.position, guide.from, guide.position, guide.to] : [guide.from, guide.position, guide.to, guide.position]}
                stroke="#f97316"
                strokeWidth={1}
                dash={[5, 4]}
                listening={false}
              />
            )) : null}
            {[...measurements, ...(measurementStart && measurementEnd ? [{ id: "draft", a: measurementStart, b: measurementEnd }] : [])].map((item) => (
              <Fragment key={item.id}>
                <Line name="plan-editor-measurements" points={[item.a.x, item.a.y, item.b.x, item.b.y]} stroke="#7c3aed" strokeWidth={2} dash={[8, 4]} listening={false} />
                <Text name="plan-editor-measurements" x={(item.a.x + item.b.x) / 2 + 8} y={(item.a.y + item.b.y) / 2 - 18} text={calculateTemporaryMeasurement(item.a, item.b, document.canvas.scale)} fill="#7c3aed" fontSize={13} fontStyle="bold" listening={false} />
              </Fragment>
            ))}
          </Layer>
          {editingPolygon && !readOnly && selectedId === editingPolygon.id ? (
            <Layer name="plan-editor-handles">
              {editingPolygon.points.map((point, index) => {
                const next = editingPolygon.points[(index + 1) % editingPolygon.points.length];
                return (
                  <Fragment key={`segment_${editingPolygon.id}_${index}`}>
                    {hoveredSegmentIndex === index ? (
                      <Line points={[point.x, point.y, next.x, next.y]} stroke="#f97316" strokeWidth={4} dash={[7, 5]} listening={false} />
                    ) : null}
                    <Line
                      points={[point.x, point.y, next.x, next.y]}
                      stroke="rgba(0,0,0,0.01)"
                      strokeWidth={18}
                      onMouseEnter={() => setHoveredSegmentIndex(index)}
                      onMouseLeave={() => setHoveredSegmentIndex((current) => current === index ? null : current)}
                      onClick={() => {
                        const rawPoint = stageRef.current?.getPointerPosition();
                        if (!rawPoint) return;
                        const projected = projectPointOnSegment(rawPoint, point, next);
                        onInsertPolygonVertex?.(editingPolygon.id, index, normalizePointer(document, projected));
                      }}
                      onTap={() => {
                        const rawPoint = stageRef.current?.getPointerPosition();
                        if (!rawPoint) return;
                        const projected = projectPointOnSegment(rawPoint, point, next);
                        onInsertPolygonVertex?.(editingPolygon.id, index, normalizePointer(document, projected));
                      }}
                    />
                  </Fragment>
                );
              })}
              {editingPolygon.points.map((point, index) => (
                <Circle
                  key={`${editingPolygon.id}_${index}`}
                  x={point.x}
                  y={point.y}
                  radius={7}
                  fill={selectedVertexIndex === index ? "#f97316" : "#ffffff"}
                  stroke="#2563eb"
                  strokeWidth={2}
                  draggable
                  onClick={() => onSelectVertex?.(index)}
                  onTap={() => onSelectVertex?.(index)}
                  onDragStart={() => onSelectVertex?.(index)}
                  onDragEnd={(event) => {
                    const nextPoint = normalizePointer(document, { x: event.target.x(), y: event.target.y() });
                    event.target.position(nextPoint);
                    onMovePolygonVertex?.(editingPolygon.id, index, nextPoint);
                  }}
                />
              ))}
            </Layer>
          ) : null}
        </Stage>
      </div>
      {draftPolygon ? (
        <div className={styles.canvasOverlay}>
          <button type="button" className={styles.button} onClick={finishPolygon} disabled={draftPolygon.points.length < 3}>
            Finalizar zona
          </button>
          <button type="button" className={styles.button} onClick={cancelPolygon}>
            Cancelar
          </button>
        </div>
      ) : null}
      <div className={styles.canvasOverlay}>
        <button type="button" className={styles.button} onClick={() => setZoom((value) => Math.min(4, value + 0.1))}>+</button>
        <button type="button" className={styles.button} onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))}>-</button>
        <button type="button" className={styles.button} onClick={() => { setZoom(1); setStagePosition({ x: 0, y: 0 }); }}>100%</button>
        <button type="button" className={styles.button} onClick={fitToScreen}>Ajustar</button>
        <button type="button" className={styles.button} onClick={() => setMeasurements([])} disabled={!measurements.length}>Limpiar medidas</button>
        <button type="button" className={styles.button} onClick={convertLastMeasurementToLine} disabled={readOnly || !allowConvertMeasurement || !measurements.length}>Convertir medida</button>
      </div>
    </div>
  );
});

export default PlanCanvas;

function renderObject(args: {
  object: PlanObject;
  selected: boolean;
  readOnly?: boolean;
  scale: PlanDocument["canvas"]["scale"];
  document: PlanDocument;
  setRef: (node: Konva.Node | null) => void;
  onSelect: (objectId: string) => void;
  onSelectionChange?: (objectIds: string[], activeObjectId?: string | null) => void;
  onMove: (objectId: string, patch: Partial<PlanObject>) => void;
  selectedIds: string[];
  onMoveSelection: (objectIds: string[], dx: number, dy: number) => void;
  onPreviewMoveSelection: (objectIds: string[], dx: number, dy: number) => void;
  editing?: boolean;
}) {
  const { object, selected, readOnly, scale, document, setRef, onSelect, onSelectionChange, onMove, selectedIds, onMoveSelection, onPreviewMoveSelection, editing } = args;
  const common = {
    ref: setRef,
    draggable: !readOnly && !object.locked,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (event.evt.shiftKey) {
        const next = selectedIds.includes(object.id) ? selectedIds.filter((id) => id !== object.id) : [...selectedIds, object.id];
        onSelectionChange?.(next, object.id);
        return;
      }
      onSelect(object.id);
    },
    onTap: () => onSelect(object.id),
  };
  const isLocked = !!object.locked;

  if (object.type === "line") {
    return (
      <Fragment key={object.id}>
        <Line
          {...common}
          x={0}
          y={0}
          points={[object.x1, object.y1, object.x2, object.y2]}
          stroke={selected ? "#2563eb" : isLocked ? "#6b7280" : object.stroke}
          strokeWidth={object.strokeWidth}
          lineCap="round"
          onDragMove={(event) => {
            const ids = selectedIds.includes(object.id) && selectedIds.length > 1 ? selectedIds : [object.id];
            onPreviewMoveSelection(ids, event.target.x(), event.target.y());
          }}
          onDragEnd={(event) => {
            const dx = event.target.x();
            const dy = event.target.y();
            event.target.position({ x: 0, y: 0 });
            if (selectedIds.includes(object.id) && selectedIds.length > 1) {
              onMoveSelection(selectedIds, dx, dy);
              return;
            }
            if (document.canvas.snap.enabled && document.canvas.snap.toObjects) {
              onMoveSelection([object.id], dx, dy);
              return;
            }
            onMove(object.id, {
              x1: snapMaybe(document, object.x1 + dx),
              y1: snapMaybe(document, object.y1 + dy),
              x2: snapMaybe(document, object.x2 + dx),
              y2: snapMaybe(document, object.y2 + dy),
            } as Partial<PlanObject>);
          }}
        />
        {object.label ? (
          <Text
            x={(object.x1 + object.x2) / 2 + 6}
            y={(object.y1 + object.y2) / 2 + 6}
            text={object.label}
            fill={object.stroke}
            fontSize={13}
            listening={false}
          />
        ) : null}
        {object.showMeasure ? (
          <Text
            x={(object.x1 + object.x2) / 2 + 10}
            y={(object.y1 + object.y2) / 2 - 18}
            text={calculateLineMeasure(object, scale)}
            fill="#2563eb"
            fontSize={13}
            fontStyle="bold"
            listening={false}
          />
        ) : null}
      </Fragment>
    );
  }

  if (object.type === "rect") {
    return (
      <Fragment key={object.id}>
        <Rect
          {...common}
          x={object.x}
          y={object.y}
          width={object.width}
          height={object.height}
          stroke={selected ? "#2563eb" : isLocked ? "#6b7280" : object.stroke}
          strokeWidth={object.strokeWidth}
          fill={object.fill}
          onDragMove={(event) => {
            const ids = selectedIds.includes(object.id) && selectedIds.length > 1 ? selectedIds : [object.id];
            onPreviewMoveSelection(ids, event.target.x() - object.x, event.target.y() - object.y);
          }}
          onDragEnd={(event) => {
            if (selectedIds.includes(object.id) && selectedIds.length > 1) {
              onMoveSelection(selectedIds, event.target.x() - object.x, event.target.y() - object.y);
              event.target.position({ x: object.x, y: object.y });
              return;
            }
            if (document.canvas.snap.enabled && document.canvas.snap.toObjects) {
              onMoveSelection([object.id], event.target.x() - object.x, event.target.y() - object.y);
              event.target.position({ x: object.x, y: object.y });
              return;
            }
            onMove(object.id, snapPatch(document, { x: event.target.x(), y: event.target.y() }) as Partial<PlanObject>);
          }}
        />
        {object.label ? (
          <Text
            x={object.x + 8}
            y={object.y + 8}
            text={object.label}
            fill={object.stroke}
            fontSize={13}
            listening={false}
          />
        ) : null}
        {object.showArea ? (
          <Text
            x={object.x + object.width / 2 - 36}
            y={object.y + object.height / 2 - 8}
            width={72}
            text={getObjectAreaLabel(object, scale)}
            fill="#2563eb"
            fontSize={13}
            fontStyle="bold"
            align="center"
            listening={false}
          />
        ) : null}
      </Fragment>
    );
  }

  if (object.type === "polygon") {
    const points = object.points.flatMap((point) => [point.x, point.y]);
    const center = getPolygonCentroid(object.points);
    const validation = validatePolygon(object.points);
    return (
      <Fragment key={object.id}>
        <Line
          {...common}
          x={0}
          y={0}
          points={points}
          closed={object.points.length >= 3}
          stroke={!validation.valid ? "#dc2626" : selected ? "#2563eb" : isLocked ? "#6b7280" : object.stroke}
          strokeWidth={object.strokeWidth}
          dash={!validation.valid ? [8, 5] : editing ? [4, 4] : undefined}
          fill={object.fill}
          onDragMove={(event) => {
            const ids = selectedIds.includes(object.id) && selectedIds.length > 1 ? selectedIds : [object.id];
            onPreviewMoveSelection(ids, event.target.x(), event.target.y());
          }}
          onDragEnd={(event) => {
            const dx = event.target.x();
            const dy = event.target.y();
            event.target.position({ x: 0, y: 0 });
            if (selectedIds.includes(object.id) && selectedIds.length > 1) {
              onMoveSelection(selectedIds, dx, dy);
              return;
            }
            if (document.canvas.snap.enabled && document.canvas.snap.toObjects) {
              onMoveSelection([object.id], dx, dy);
              return;
            }
            onMove(object.id, {
              points: object.points.map((point) => normalizePointer(document, { x: point.x + dx, y: point.y + dy })),
            } as Partial<PlanObject>);
          }}
        />
        {object.label ? (
          <Text x={center.x + 8} y={center.y + 8} text={object.label} fill={object.stroke} fontSize={13} listening={false} />
        ) : null}
        {object.showArea && validation.valid ? (
          <Text
            x={center.x - 44}
            y={center.y - 8}
            width={88}
            text={getObjectAreaLabel(object, scale)}
            fill="#2563eb"
            fontSize={13}
            fontStyle="bold"
            align="center"
            listening={false}
          />
        ) : null}
      </Fragment>
    );
  }

  if (object.type === "symbol") {
    return (
      <PlanSymbolNode
        key={object.id}
        object={object}
        selected={selected}
        readOnly={readOnly}
        setRef={setRef}
        onSelect={onSelect}
        onSelectionChange={onSelectionChange}
        onMove={(objectId, patch) => onMove(objectId, snapPatch(document, patch) as Partial<PlanObject>)}
        selectedIds={selectedIds}
        onMoveSelection={onMoveSelection}
        onPreviewMoveSelection={onPreviewMoveSelection}
      />
    );
  }

  return (
    <Text
      key={object.id}
      {...common}
      x={object.x}
      y={object.y}
      text={object.text}
      fill={selected ? "#2563eb" : object.fill}
      fontSize={object.fontSize}
      onDragMove={(event) => {
        const ids = selectedIds.includes(object.id) && selectedIds.length > 1 ? selectedIds : [object.id];
        onPreviewMoveSelection(ids, event.target.x() - object.x, event.target.y() - object.y);
      }}
      onDragEnd={(event) => {
        if (selectedIds.includes(object.id) && selectedIds.length > 1) {
          onMoveSelection(selectedIds, event.target.x() - object.x, event.target.y() - object.y);
          event.target.position({ x: object.x, y: object.y });
          return;
        }
        if (document.canvas.snap.enabled && document.canvas.snap.toObjects) {
          onMoveSelection([object.id], event.target.x() - object.x, event.target.y() - object.y);
          event.target.position({ x: object.x, y: object.y });
          return;
        }
        onMove(object.id, snapPatch(document, { x: event.target.x(), y: event.target.y() }) as Partial<PlanObject>);
      }}
    />
  );
}

function PlanSymbolNode({
  object,
  selected,
  readOnly,
  setRef,
  onSelect,
  onSelectionChange,
  onMove,
  selectedIds,
  onMoveSelection,
  onPreviewMoveSelection,
}: {
  object: Extract<PlanObject, { type: "symbol" }>;
  selected: boolean;
  readOnly?: boolean;
  setRef: (node: Konva.Node | null) => void;
  onSelect: (objectId: string) => void;
  onSelectionChange?: (objectIds: string[], activeObjectId?: string | null) => void;
  onMove: (objectId: string, patch: Partial<PlanObject>) => void;
  selectedIds: string[];
  onMoveSelection: (objectIds: string[], dx: number, dy: number) => void;
  onPreviewMoveSelection: (objectIds: string[], dx: number, dy: number) => void;
}) {
  const icon = getPlanIconInfo(object.symbolIcon);
  const image = useImage(icon.kind === "image" ? icon.value : "");
  const color = selected ? "#2563eb" : object.symbolColor || "#111827";
  const markerSize = object.size;
  const labelWidth = object.size * 2.8;
  const label = object.symbolLabel || object.symbolId;
  const canvasText = getSymbolCanvasText(object.symbolIcon, label, object.symbolId);

  return (
    <Group
      ref={setRef}
      x={object.x}
      y={object.y}
      draggable={!readOnly && !object.locked}
      onClick={(event) => {
        if ((event.evt as MouseEvent).shiftKey) {
          const next = selectedIds.includes(object.id) ? selectedIds.filter((id) => id !== object.id) : [...selectedIds, object.id];
          onSelectionChange?.(next, object.id);
          return;
        }
        onSelect(object.id);
      }}
      onTap={() => onSelect(object.id)}
      onDragMove={(event) => {
        const ids = selectedIds.includes(object.id) && selectedIds.length > 1 ? selectedIds : [object.id];
        onPreviewMoveSelection(ids, event.target.x() - object.x, event.target.y() - object.y);
      }}
      onDragEnd={(event) => {
        if (selectedIds.includes(object.id) && selectedIds.length > 1) {
          onMoveSelection(selectedIds, event.target.x() - object.x, event.target.y() - object.y);
          event.target.position({ x: object.x, y: object.y });
          return;
        }
        // Single-symbol object snapping is handled by the same selection mover.
        if (selectedIds.length <= 1) {
          onMoveSelection([object.id], event.target.x() - object.x, event.target.y() - object.y);
          event.target.position({ x: object.x, y: object.y });
          return;
        }
        onMove(object.id, { x: event.target.x(), y: event.target.y() } as Partial<PlanObject>);
      }}
    >
      {image ? (
        <KonvaImage image={image} x={0} y={0} width={markerSize} height={markerSize} />
      ) : icon.kind === "emoji" || icon.kind === "text" ? (
        <Text
          x={0}
          y={0}
          width={labelWidth}
          height={markerSize + 8}
          text={canvasText}
          fill={color}
          fontSize={icon.kind === "emoji" ? markerSize : Math.max(12, Math.round(markerSize * 0.45))}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
        />
      ) : (
        <>
          <Rect
            x={(labelWidth - markerSize) / 2}
            y={0}
            width={markerSize}
            height={markerSize}
            cornerRadius={8}
            stroke={color}
            strokeWidth={2}
            fill="#f9fafb"
          />
          <Text
            x={0}
            y={0}
            width={labelWidth}
            height={markerSize}
            text={canvasText}
            fill={color}
            fontSize={Math.max(11, Math.round(markerSize * 0.42))}
            fontStyle="bold"
            align="center"
            verticalAlign="middle"
          />
        </>
      )}
      {label ? (
        <Text
          x={0}
          y={markerSize + 6}
          width={labelWidth}
          text={label}
          fill={color}
          fontSize={11}
          align="center"
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function useImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!cancelled) setImage(nextImage);
    };
    nextImage.onerror = () => {
      if (!cancelled) setImage(null);
    };
    nextImage.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return image;
}

function normalizeRectDraft(rect: PlanRectObject): PlanRectObject {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;

  return {
    ...rect,
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function normalizeBounds(a: PlanPolygonPoint, b: PlanPolygonPoint): PlanBounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function normalizePointer(document: PlanDocument, point: PlanPolygonPoint) {
  return shouldSnap(document) ? snapPoint(point, document.canvas.grid.size) : point;
}

function snapMaybe(document: PlanDocument, value: number) {
  return shouldSnap(document) ? Math.round(value / document.canvas.grid.size) * document.canvas.grid.size : value;
}

function snapPatch(document: PlanDocument, patch: Partial<PlanObject>) {
  if (!shouldSnap(document)) return patch;
  const next: Record<string, unknown> = { ...patch };
  for (const key of ["x", "y", "x1", "y1", "x2", "y2"]) {
    if (typeof next[key] === "number") next[key] = snapMaybe(document, next[key]);
  }
  return next;
}

function getPolygonCenter(points: PlanPolygonPoint[]) {
  if (!points.length) return { x: 0, y: 0 };
  const totals = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: totals.x / points.length, y: totals.y / points.length };
}

function GridLayer({ document }: { document: PlanDocument }) {
  const size = document.canvas.grid.size;
  const lines: ReactNode[] = [];
  for (let x = 0; x <= document.canvas.width; x += size) {
    lines.push(<Line key={`gx_${x}`} points={[x, 0, x, document.canvas.height]} stroke="rgba(148, 163, 184, 0.28)" strokeWidth={1} listening={false} />);
  }
  for (let y = 0; y <= document.canvas.height; y += size) {
    lines.push(<Line key={`gy_${y}`} points={[0, y, document.canvas.width, y]} stroke="rgba(148, 163, 184, 0.28)" strokeWidth={1} listening={false} />);
  }
  return <Layer name="plan-grid" listening={false}>{lines}</Layer>;
}

function PlanRulers({ document, zoom }: { document: PlanDocument; zoom: number }) {
  const step = document.canvas.grid.size || 50;
  const top: ReactNode[] = [];
  const left: ReactNode[] = [];
  for (let x = 0; x <= document.canvas.width; x += step) {
    top.push(<span key={x} className={styles.rulerTick} style={{ left: x * zoom }}>{formatRulerValue(x, document)}</span>);
  }
  for (let y = 0; y <= document.canvas.height; y += step) {
    left.push(<span key={y} className={styles.rulerTickVertical} style={{ top: y * zoom }}>{formatRulerValue(y, document)}</span>);
  }
  return (
    <>
      <div className={styles.rulerTop}>{top}</div>
      <div className={styles.rulerLeft}>{left}</div>
    </>
  );
}

function formatRulerValue(value: number, document: PlanDocument) {
  const scale = document.canvas.scale;
  if (!scale?.pixels || !scale.realValue) return `${Math.round(value)}`;
  return `${Math.round((value / scale.pixels) * scale.realValue * 100) / 100}${scale.unit}`;
}

function getBackgroundImageProps(document: PlanDocument, image: HTMLImageElement) {
  const fit = document.background.fit;
  if (fit === "stretch") return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
  if (fit === "original") return { x: 0, y: 0, width: image.width, height: image.height };

  const canvasRatio = document.canvas.width / document.canvas.height;
  const imageRatio = image.width / image.height;
  const cover = fit === "cover";
  const matchWidth = cover ? imageRatio < canvasRatio : imageRatio > canvasRatio;
  const width = matchWidth ? document.canvas.width : document.canvas.height * imageRatio;
  const height = matchWidth ? document.canvas.width / imageRatio : document.canvas.height;
  return {
    x: (document.canvas.width - width) / 2,
    y: (document.canvas.height - height) / 2,
    width,
    height,
  };
}

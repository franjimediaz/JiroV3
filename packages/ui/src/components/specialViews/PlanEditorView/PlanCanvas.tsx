"use client";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import styles from "./PlanEditorView.module.css";
import type { PlanDocument, PlanLineObject, PlanObject, PlanRectObject, PlanSymbolDefinition, PlanTool } from "./planTypes";
import { calculateLineMeasure, createPlanObjectId, getPlanLayer, getVisiblePlanObjects, isPlanObjectEditable, updatePlanObject } from "./planUtils";

type Props = {
  document: PlanDocument;
  tool: PlanTool;
  selectedId: string | null;
  readOnly?: boolean;
  activeSymbol: PlanSymbolDefinition | null;
  onChange: (document: PlanDocument) => void;
  onSelect: (objectId: string | null) => void;
};

type DraftObject = PlanLineObject | PlanRectObject | null;

export type PlanCanvasHandle = {
  getStage: () => Konva.Stage | null;
};

const PlanCanvas = forwardRef<PlanCanvasHandle, Props>(function PlanCanvas(
  { document, tool, selectedId, readOnly, activeSymbol, onChange, onSelect },
  ref
) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Record<string, Konva.Node | null>>({});
  const [draft, setDraft] = useState<DraftObject>(null);
  const backgroundImage = useImage(document.background?.url || "");
  const visibleObjects = useMemo(() => getVisiblePlanObjects(document), [document]);

  const selectedObject = useMemo(
    () => document.objects.find((object) => object.id === selectedId) || null,
    [document.objects, selectedId]
  );

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }), []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const selectedNode = selectedId ? shapeRefs.current[selectedId] : null;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, document.objects]);

  const commitObject = (object: PlanObject) => {
    onChange({ ...document, objects: [...document.objects, object] });
    onSelect(object.id);
  };

  const updateObject = (objectId: string, patch: Partial<PlanObject>) => {
    onChange(updatePlanObject(document, objectId, patch));
  };

  const handleStagePointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (readOnly) return;
    const stage = stageRef.current;
    const point = stage?.getPointerPosition();
    if (!point) return;
    const activeLayer = getPlanLayer(document, document.activeLayerId);
    const canDrawOnLayer = !readOnly && activeLayer.visible !== false && !activeLayer.locked;

    if (event.target === stage && tool === "select") {
      onSelect(null);
      return;
    }

    if (!canDrawOnLayer) return;

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
  };

  const handleStagePointerMove = () => {
    if (readOnly || !draft) return;
    const point = stageRef.current?.getPointerPosition();
    if (!point) return;

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

  return (
    <div className={styles.canvasWrap}>
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
        >
          {backgroundImage ? (
            <Layer listening={false}>
              <KonvaImage
                image={backgroundImage}
                x={0}
                y={0}
                width={document.canvas.width}
                height={document.canvas.height}
                opacity={document.background?.opacity ?? 1}
                listening={false}
              />
            </Layer>
          ) : null}
          <Layer>
            {visibleObjects.map((object) => renderObject({
              object,
              selected: object.id === selectedId,
              readOnly: readOnly || !isPlanObjectEditable(document, object, readOnly),
              scale: document.canvas.scale,
              setRef: (node) => {
                shapeRefs.current[object.id] = node;
              },
              onSelect,
              onMove: updateObject,
            }))}

            {draft ? renderObject({
              object: draft.type === "rect" ? normalizeRectDraft(draft) : draft,
              selected: false,
              readOnly: true,
              scale: document.canvas.scale,
              setRef: () => undefined,
              onSelect: () => undefined,
              onMove: () => undefined,
            }) : null}

            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              resizeEnabled={false}
              enabledAnchors={[]}
              borderStroke="#2563eb"
              borderDash={[6, 4]}
              ignoreStroke
              visible={!!selectedObject}
            />
          </Layer>
        </Stage>
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
  setRef: (node: Konva.Node | null) => void;
  onSelect: (objectId: string) => void;
  onMove: (objectId: string, patch: Partial<PlanObject>) => void;
}) {
  const { object, selected, readOnly, scale, setRef, onSelect, onMove } = args;
  const common = {
    ref: setRef,
    draggable: !readOnly && !object.locked,
    onClick: () => onSelect(object.id),
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
          onDragEnd={(event) => {
            const dx = event.target.x();
            const dy = event.target.y();
            event.target.position({ x: 0, y: 0 });
            onMove(object.id, {
              x1: object.x1 + dx,
              y1: object.y1 + dy,
              x2: object.x2 + dx,
              y2: object.y2 + dy,
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
          onDragEnd={(event) => onMove(object.id, { x: event.target.x(), y: event.target.y() } as Partial<PlanObject>)}
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
      </Fragment>
    );
  }

  if (object.type === "symbol") {
    const color = object.symbolColor || "#111827";
    const text = object.symbolIcon || object.symbolLabel || object.symbolId;
    return (
      <Fragment key={object.id}>
        <Text
          {...common}
          x={object.x}
          y={object.y}
          width={object.size * 2.6}
          height={object.size + 10}
          text={text}
          fill={selected ? "#2563eb" : color}
          fontSize={object.symbolIcon ? object.size : Math.max(12, Math.round(object.size * 0.45))}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          onDragEnd={(event) => onMove(object.id, { x: event.target.x(), y: event.target.y() } as Partial<PlanObject>)}
        />
        {object.symbolIcon && object.symbolLabel ? (
          <Text
            x={object.x}
            y={object.y + object.size + 6}
            width={object.size * 2.6}
            text={object.symbolLabel}
            fill={color}
            fontSize={11}
            align="center"
            listening={false}
          />
        ) : null}
      </Fragment>
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
      onDragEnd={(event) => onMove(object.id, { x: event.target.x(), y: event.target.y() } as Partial<PlanObject>)}
    />
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

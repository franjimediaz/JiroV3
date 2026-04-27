import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = process.cwd();
const tempDir = path.join(os.tmpdir(), "jiro-plan-editor-tests");
await mkdir(tempDir, { recursive: true });

async function transpileUtility(sourcePath, outputName) {
  const source = await readFile(path.join(repoRoot, sourcePath), "utf8");
  const withoutTypeImports = source.replace(/^import type .*?;\r?\n/gm, "");
  const js = ts.transpileModule(withoutTypeImports, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const outputPath = path.join(tempDir, outputName);
  await writeFile(outputPath, js, "utf8");
  return outputPath;
}

const planUtilsPath = await transpileUtility(
  "packages/ui/src/components/specialViews/PlanEditorView/planUtils.ts",
  "planUtils.mjs"
);
const historyUtilsPath = await transpileUtility(
  "packages/ui/src/components/specialViews/PlanEditorView/planHistoryUtils.ts",
  "planHistoryUtils.mjs"
);

const planUtils = await import(pathToFileURL(planUtilsPath).href);
const historyUtils = await import(pathToFileURL(historyUtilsPath).href);

test("normalizePlanData migrates version 5 documents to version 7", () => {
  const plan = planUtils.normalizePlanData({
    version: 5,
    canvas: { width: 400, height: 300, unit: "m", grid: { enabled: true, size: 10, snap: true }, scale: { pixels: 245.5, realValue: 2.45, unit: "m", calibratedFrom: { objectId: "obj_1", pixelLength: 245.5, realLength: 2.45, unit: "m", calibratedAt: "2026-04-27T00:00:00.000Z" } } },
    background: { url: "https://example.com/bg.png", fit: "cover" },
    layers: [{ id: "layer_a", name: "A", visible: true, locked: false, order: 1 }],
    activeLayerId: "layer_a",
    objects: [],
  });

  assert.equal(plan.version, 7);
  assert.equal(plan.background.fit, "cover");
  assert.equal(plan.canvas.grid.size, 10);
  assert.equal(plan.canvas.scale.calibratedFrom.objectId, "obj_1");
});

test("normalizePlanData creates a valid version 7 document without version", () => {
  const plan = planUtils.normalizePlanData({});
  assert.equal(plan.version, 7);
  assert.equal(plan.layers.length, 1);
  assert.equal(plan.canvas.grid.snap, true);
  assert.equal(plan.canvas.snap.toObjects, true);
  assert.equal(plan.canvas.view.showRulers, true);
});

test("normalizePlanData assigns fallback layer to objects without layerId", () => {
  const plan = planUtils.normalizePlanData({
    layers: [{ id: "layer_a", name: "A", visible: true, locked: false, order: 1 }],
    activeLayerId: "layer_a",
    objects: [{ id: "obj_1", type: "text", x: 1, y: 2, text: "T", fontSize: 12, fill: "#111827" }],
  });
  assert.equal(plan.objects[0].layerId, "layer_a");
});

test("mergeDefaultLayersIfNeeded does not duplicate initialized layers", () => {
  const plan = planUtils.createDefaultPlanData();
  const merged = planUtils.mergeDefaultLayersIfNeeded(plan, [
    { id: "layer_a", name: "A", visible: true, locked: false, order: 1 },
  ]);
  const again = planUtils.mergeDefaultLayersIfNeeded(merged, [
    { id: "layer_b", name: "B", visible: true, locked: false, order: 1 },
  ]);
  assert.equal(again.layers.length, 1);
  assert.equal(again.layers[0].id, "layer_a");
});

test("area helpers handle scale and invalid scale", () => {
  const scale = { pixels: 100, realValue: 1, unit: "m" };
  assert.equal(planUtils.calculateRectArea({ width: 200, height: 100 }, scale), 2);
  assert.equal(planUtils.calculatePolygonArea([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], scale), 1);
  assert.equal(planUtils.calculatePolygonArea([{ x: 0, y: 0 }, { x: 100, y: 0 }], scale), null);
  assert.equal(planUtils.hasValidScale({ pixels: 0, realValue: 1, unit: "m" }), false);
  assert.equal(planUtils.formatArea(null, "m"), "Sin escala");
});

test("snap helpers round to grid", () => {
  assert.equal(planUtils.snapValue(26, 20), 20);
  assert.deepEqual(planUtils.snapPoint({ x: 29, y: 31 }, 20), { x: 20, y: 40 });
});

test("segment geometry helpers project and find nearby segments", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };
  assert.deepEqual(planUtils.projectPointOnSegment({ x: 30, y: 40 }, a, b), { x: 30, y: 0 });
  assert.equal(planUtils.distancePointToSegment({ x: 30, y: 40 }, a, b), 40);
  const points = [a, b, { x: 100, y: 100 }, { x: 0, y: 100 }];
  assert.equal(planUtils.getClosestSegment(points, { x: 40, y: 4 }, 10).index, 0);
  assert.equal(planUtils.getClosestSegment(points, { x: 40, y: 40 }, 10), null);
  assert.deepEqual(planUtils.insertPointInPolygonSegment(points, 0, { x: 50, y: 0 })[1], { x: 50, y: 0 });
});

test("polygon validation catches duplicate, zero-area and self-intersections", () => {
  assert.equal(planUtils.validatePolygon([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]).valid, true);
  assert.equal(planUtils.validatePolygon([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]).valid, false);
  assert.equal(planUtils.validatePolygon([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]).valid, false);
  assert.equal(planUtils.validatePolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]).valid, false);
});

test("polygon centroid falls back for degenerate polygons", () => {
  assert.deepEqual(planUtils.getPolygonCentroid([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]), { x: 50, y: 50 });
  assert.deepEqual(planUtils.getPolygonCentroid([{ x: 0, y: 0 }, { x: 100, y: 0 }]), { x: 50, y: 0 });
});

test("calibrateScaleFromLine handles valid and zero-length lines", () => {
  const line = { id: "line_1", type: "line", x1: 0, y1: 0, x2: 300, y2: 400, stroke: "#111827", strokeWidth: 2, label: "", showMeasure: true };
  const scale = planUtils.calibrateScaleFromLine(line, 5, "m");
  assert.equal(scale.pixels, 500);
  assert.equal(scale.realValue, 5);
  assert.equal(scale.calibratedFrom.objectId, "line_1");
  assert.throws(() => planUtils.calibrateScaleFromLine({ ...line, x2: 0, y2: 0 }, 5, "m"));
});

test("history helpers skip duplicates and respect limit", () => {
  const base = planUtils.createDefaultPlanData();
  const next = { ...base, activeLayerId: "layer_next" };
  let state = historyUtils.createInitialHistoryState(base);
  state = historyUtils.pushHistoryState(state, base, 2);
  assert.equal(state.past.length, 0);
  state = historyUtils.pushHistoryState(state, next, 2);
  state = historyUtils.pushHistoryState(state, { ...next, activeLayerId: "layer_2" }, 2);
  state = historyUtils.pushHistoryState(state, { ...next, activeLayerId: "layer_3" }, 2);
  assert.equal(state.past.length, 2);
  state = historyUtils.undoHistoryState(state);
  assert.equal(state.current.activeLayerId, "layer_2");
  state = historyUtils.redoHistoryState(state);
  assert.equal(state.current.activeLayerId, "layer_3");
});

test("snap point helpers support line, rect, polygon, symbol and text", () => {
  assert.equal(planUtils.getObjectSnapPoints({ id: "line", type: "line", x1: 0, y1: 0, x2: 10, y2: 0, stroke: "#111", strokeWidth: 1, label: "", showMeasure: true }).length, 2);
  assert.equal(planUtils.getObjectSnapPoints({ id: "rect", type: "rect", x: 0, y: 0, width: 10, height: 20, stroke: "#111", strokeWidth: 1, fill: "transparent", label: "", showArea: true }).length, 5);
  assert.equal(planUtils.getObjectSnapPoints({ id: "poly", type: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], stroke: "#111", strokeWidth: 1, fill: "transparent", label: "", showArea: true }).length, 3);
  assert.equal(planUtils.getObjectSnapPoints({ id: "sym", type: "symbol", x: 0, y: 0, symbolId: "s", symbolLabel: "S", size: 20 }).length, 5);
  assert.equal(planUtils.getObjectSnapPoints({ id: "txt", type: "text", x: 0, y: 0, text: "abc", fontSize: 10, fill: "#111" }).length, 5);
});

test("object snap finds nearest candidate within threshold", () => {
  const candidates = [{ x: 10, y: 10 }, { x: 100, y: 100 }];
  assert.deepEqual(planUtils.findNearestSnapPoint({ x: 13, y: 12 }, candidates, 5), { x: 10, y: 10, distance: Math.hypot(3, 2) });
  assert.equal(planUtils.findNearestSnapPoint({ x: 30, y: 30 }, candidates, 5), null);
  assert.deepEqual(planUtils.applyObjectSnap({ x: 13, y: 12 }, candidates, 5).point, { x: 10, y: 10 });
});

test("selection bounds and rectangle selection work", () => {
  const objects = [
    { id: "a", type: "rect", x: 10, y: 10, width: 20, height: 20, stroke: "#111", strokeWidth: 1, fill: "transparent", label: "", showArea: true },
    { id: "b", type: "text", x: 80, y: 80, text: "B", fontSize: 10, fill: "#111" },
  ];
  assert.deepEqual(planUtils.getSelectionBounds(objects, ["a"]), { x: 10, y: 10, width: 20, height: 20 });
  assert.equal(planUtils.objectIntersectsRect(objects[0], { x: 0, y: 0, width: 50, height: 50 }), true);
  assert.equal(planUtils.objectIntersectsRect(objects[1], { x: 0, y: 0, width: 50, height: 50 }), false);
});

test("moveObjectsByDelta moves only editable selected objects", () => {
  const objects = [
    { id: "a", layerId: "free", type: "rect", x: 0, y: 0, width: 10, height: 10, stroke: "#111", strokeWidth: 1, fill: "transparent", label: "", showArea: true },
    { id: "b", layerId: "locked", type: "rect", x: 0, y: 0, width: 10, height: 10, stroke: "#111", strokeWidth: 1, fill: "transparent", label: "", showArea: true },
  ];
  const moved = planUtils.moveObjectsByDelta(objects, ["a", "b"], 5, 7, {
    layers: [
      { id: "free", name: "Free", visible: true, locked: false, order: 1 },
      { id: "locked", name: "Locked", visible: true, locked: true, order: 2 },
    ],
  });
  assert.equal(moved[0].x, 5);
  assert.equal(moved[1].x, 0);
});

test("temporary measurement uses scale or pixels", () => {
  assert.equal(planUtils.calculateTemporaryMeasurement({ x: 0, y: 0 }, { x: 300, y: 400 }, { pixels: 100, realValue: 1, unit: "m" }), "5 m");
  assert.equal(planUtils.calculateTemporaryMeasurement({ x: 0, y: 0 }, { x: 3, y: 4 }, null), "5 px");
});

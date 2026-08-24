"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadFaceZoom() {
  const window = { __DVH__: {} };
  const context = vm.createContext({ window, Math, Number, Object });
  const source = fs.readFileSync(path.join(__dirname, "../src/content/face-zoom.js"), "utf8");
  vm.runInContext(source, context);
  return window.__DVH__.faceZoom;
}

test("computeCrop preserves the tile aspect ratio and contains the face", () => {
  const api = loadFaceZoom();
  const face = { x: 700, y: 180, width: 240, height: 280 };
  const crop = api.computeCrop(face, {
    sourceWidth: 1920,
    sourceHeight: 1080,
    targetWidth: 400,
    targetHeight: 300,
    padding: 1.8
  });

  assert.ok(Math.abs(crop.width / crop.height - 4 / 3) < 0.0001);
  assert.ok(crop.x <= face.x);
  assert.ok(crop.y <= face.y);
  assert.ok(crop.x + crop.width >= face.x + face.width);
  assert.ok(crop.y + crop.height >= face.y + face.height);
});

test("computeCrop clamps an edge-of-frame face without leaving the source", () => {
  const api = loadFaceZoom();
  const crop = api.computeCrop(
    { x: 4, y: 8, width: 120, height: 150 },
    {
      sourceWidth: 640,
      sourceHeight: 360,
      targetWidth: 320,
      targetHeight: 180,
      padding: 2
    }
  );

  assert.ok(crop.x >= 0);
  assert.ok(crop.y >= 0);
  assert.ok(crop.x + crop.width <= 640);
  assert.ok(crop.y + crop.height <= 360);
  assert.ok(Math.abs(crop.width / crop.height - 16 / 9) < 0.0001);
});

test("smoothCrop moves part-way toward a new detection", () => {
  const api = loadFaceZoom();
  const result = api.smoothCrop(
    { x: 0, y: 20, width: 200, height: 100 },
    { x: 100, y: 60, width: 300, height: 200 },
    0.25
  );

  assert.deepEqual({ ...result }, { x: 25, y: 30, width: 225, height: 125 });
});

test("tight face crop excludes most of the shoulders", () => {
  const api = loadFaceZoom();
  const face = { x: 500, y: 180, width: 200, height: 240 };
  const crop = api.computeCrop(face, {
    sourceWidth: 1280,
    sourceHeight: 720,
    targetWidth: 400,
    targetHeight: 300,
    padding: 1.3
  });

  assert.ok(crop.height <= face.height * 1.31);
});

test("stabilizeCrop ignores tiny detector movements", () => {
  const api = loadFaceZoom();
  const previous = { x: 300, y: 100, width: 400, height: 300 };
  const result = api.stabilizeCrop(previous, { x: 304, y: 103, width: 405, height: 304 });

  assert.deepEqual({ ...result }, previous);
});

test("safety state requires two detections before showing a crop", () => {
  const api = loadFaceZoom();
  let state = api.createSafetyState();

  state = api.updateSafetyState(state, { now: 100, detected: true });
  assert.equal(state.phase, "full");

  state = api.updateSafetyState(state, { now: 200, detected: true });
  assert.equal(state.phase, "tracking");
});

test("safety state holds a crop through a brief missed detection", () => {
  const api = loadFaceZoom();
  let state = api.createSafetyState();
  state = api.updateSafetyState(state, { now: 100, detected: true });
  state = api.updateSafetyState(state, { now: 200, detected: true });

  state = api.updateSafetyState(state, { now: 700, detected: false, lostTimeoutMs: 900 });
  assert.equal(state.phase, "holding");

  state = api.updateSafetyState(state, { now: 1101, detected: false, lostTimeoutMs: 900 });
  assert.equal(state.phase, "full");
  assert.equal(state.consecutiveDetections, 0);
});

test("reacquisition can require three stable detections", () => {
  const api = loadFaceZoom();
  let state = api.createSafetyState();
  state = api.updateSafetyState(state, { now: 100, detected: true, requiredDetections: 3 });
  state = api.updateSafetyState(state, { now: 200, detected: true, requiredDetections: 3 });
  assert.equal(state.phase, "full");

  state = api.updateSafetyState(state, { now: 300, detected: true, requiredDetections: 3 });
  assert.equal(state.phase, "tracking");
});

test("an invalid detection keeps the full-video fallback active", () => {
  const api = loadFaceZoom();
  let state = api.createSafetyState();
  state = api.updateSafetyState(state, { now: 100, detected: true });
  state = api.updateSafetyState(state, { now: 200, detected: false });
  state = api.updateSafetyState(state, { now: 300, detected: true });

  assert.equal(state.phase, "full");
  assert.equal(state.consecutiveDetections, 1);
});

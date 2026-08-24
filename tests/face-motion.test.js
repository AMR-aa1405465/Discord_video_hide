"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMotion() {
  const window = { __DVH__: {} };
  const context = vm.createContext({ window, Math, Number, Object, Array, Uint8Array });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/content/face-motion.js"), "utf8"),
    context
  );
  return window.__DVH__.faceMotion;
}

function texturedFrame(width, height, shiftX = 0, shiftY = 0) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = x - shiftX;
      const sourceY = y - shiftY;
      pixels[y * width + x] =
        sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height
          ? 0
          : (sourceX * 17 + sourceY * 29 + (sourceX * sourceY) % 71) % 256;
    }
  }
  return pixels;
}

test("sparse optical flow estimates a small image translation", () => {
  const api = loadMotion();
  const width = 80;
  const height = 60;
  const result = api.estimateOpticalFlow(
    texturedFrame(width, height),
    texturedFrame(width, height, 2, 1),
    width,
    height,
    { x: 16, y: 12, width: 48, height: 36 }
  );

  assert.ok(result);
  assert.ok(Math.abs(result.dx - 2) < 1);
  assert.ok(Math.abs(result.dy - 1) < 1);
  assert.ok(result.quality >= 0.3);
});

test("Kalman correction learns movement and predicts it forward", () => {
  const api = loadMotion();
  const filter = api.createBoxKalman({ x: 100, y: 50, width: 200, height: 120 }, 0);
  api.correctBoxKalman(filter, { x: 120, y: 50, width: 200, height: 120 }, 100);
  const corrected = api.currentBox(filter);
  const predicted = api.predictBoxKalman(filter, 200);

  assert.ok(corrected.x > 100 && corrected.x < 120);
  assert.ok(predicted.x > corrected.x);
  assert.equal(Math.round(predicted.height), 120);
});

test("motion tracking can keep an already acquired crop active", () => {
  const window = { __DVH__: {} };
  const context = vm.createContext({ window, Math, Number, Object });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/content/face-zoom.js"), "utf8"),
    context
  );
  const api = window.__DVH__.faceZoom;
  let state = api.createSafetyState();
  state = api.updateSafetyState(state, { now: 100, detected: true });
  state = api.updateSafetyState(state, { now: 200, detected: true });
  state = api.updateSafetyState(state, { now: 1000, detected: false, lostTimeoutMs: 2500 });
  state = api.updateSafetyState(state, { now: 1200, tracked: true, lostTimeoutMs: 2500 });

  assert.equal(state.phase, "tracking");
  assert.equal(state.lastSeenAt, 1200);
});

test("manifest loads motion tracking before the face controller", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const motion = scripts.indexOf("src/content/face-motion.js");
  const controller = scripts.indexOf("src/content/face-zoom-controller.js");

  assert.ok(motion >= 0);
  assert.ok(motion < controller);
});

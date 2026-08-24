"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("controller uses a tight crop, holds brief misses, then returns to full video", async () => {
  const callbacks = [];
  const detections = [
    { x: 420, y: 100, width: 180, height: 210 },
    { x: 430, y: 105, width: 180, height: 210 },
    { x: 432, y: 106, width: 180, height: 210 },
    null,
    null
  ];
  let drawCount = 0;
  const sourceRects = [];
  const context2d = {
    drawImage(_video, x, y, width, height) {
      drawCount += 1;
      sourceRects.push({ x, y, width, height });
    }
  };
  const canvas = {
    hidden: false,
    width: 0,
    height: 0,
    getContext: () => context2d
  };
  const video = {
    readyState: 4,
    videoWidth: 1280,
    videoHeight: 720,
    requestVideoFrameCallback(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancelVideoFrameCallback() {}
  };
  const record = {
    tileEl: { getBoundingClientRect: () => ({ width: 400, height: 300 }) },
    videoEl: video,
    canvasEl: canvas
  };
  const window = {
    devicePixelRatio: 1,
    __DVH__: {
      faceDetector: {
        detect: async () => detections.shift() || null
      }
    }
  };
  const context = vm.createContext({
    window,
    Math,
    Number,
    Object,
    Promise,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}
  });
  for (const file of ["src/content/face-zoom.js", "src/content/face-zoom-controller.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }

  window.__DVH__.faceZoomController.start(record);
  assert.equal(canvas.hidden, true);

  callbacks.at(-1)(100);
  await flushPromises();
  assert.equal(canvas.hidden, true);
  assert.equal(drawCount, 0);

  callbacks.at(-1)(300);
  await flushPromises();
  assert.equal(canvas.hidden, true);

  callbacks.at(-1)(500);
  await flushPromises();
  callbacks.at(-1)(550);
  assert.equal(canvas.hidden, false);
  assert.ok(drawCount > 0);
  assert.ok(sourceRects.at(-1).height < 300);

  callbacks.at(-1)(700);
  await flushPromises();
  assert.equal(canvas.hidden, false);

  callbacks.at(-1)(3001);
  await flushPromises();
  assert.equal(canvas.hidden, true);

  window.__DVH__.faceZoomController.stop(record);
  assert.equal(record.faceZoomSession, null);
  assert.equal(canvas.hidden, true);
});

test("controller recognizes fast movement and accepts a wider adaptive profile", () => {
  const callbacks = [];
  const record = {
    key: "id:adaptive",
    tileEl: { getBoundingClientRect: () => ({ width: 400, height: 300 }) },
    videoEl: {
      requestVideoFrameCallback(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancelVideoFrameCallback() {}
    },
    canvasEl: { hidden: false }
  };
  const window = { __DVH__: { faceDetector: { detect: async () => null } } };
  const context = vm.createContext({
    window,
    Math,
    Number,
    Object,
    Promise,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}
  });
  for (const file of ["src/content/face-zoom.js", "src/content/face-zoom-controller.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }

  const controller = window.__DVH__.faceZoomController;
  const ratio = controller.movementRatio(
    { x: 100, y: 100, width: 100, height: 100 },
    { x: 130, y: 100, width: 100, height: 100 }
  );
  assert.ok(ratio > 0.18);

  controller.start(record, { level: 0, padding: 1.3, lostTimeoutMs: 2500, maxOcclusionMs: 5000 });
  controller.start(record, { level: 2, padding: 1.65, lostTimeoutMs: 5000, maxOcclusionMs: 10000 });
  assert.equal(record.faceZoomSession.profile.level, 2);
  assert.equal(record.faceZoomSession.profile.padding, 1.65);
  assert.equal(record.faceZoomSession.profile.maxOcclusionMs, 10000);
  controller.stop(record);
});

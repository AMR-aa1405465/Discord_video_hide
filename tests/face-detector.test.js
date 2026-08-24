"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("detector uses the preloaded isolated-world WASM factory", async () => {
  let receivedFileset = null;
  const detector = {
    detectForVideo: () => ({
      detections: [{ boundingBox: { originX: 10, originY: 20, width: 100, height: 120 } }]
    })
  };
  const window = {
    __DVH__: {},
    Vision: {
      FaceDetector: {
        async createFromOptions(fileset) {
          receivedFileset = fileset;
          return detector;
        }
      }
    }
  };
  const chrome = { runtime: { getURL: (value) => `chrome-extension://test/${value}` } };
  const context = vm.createContext({ window, chrome, Promise, Number, console, performance: { now: () => 1 } });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/content/face-detector.js"), "utf8"),
    context
  );

  const result = await window.__DVH__.faceDetector.detect(
    { videoWidth: 1280, videoHeight: 720 },
    100
  );

  assert.equal(receivedFileset.wasmLoaderPath, undefined);
  assert.equal(
    receivedFileset.wasmBinaryPath,
    "chrome-extension://test/vendor/mediapipe/wasm/vision_wasm_internal.wasm"
  );
  assert.deepEqual({ ...result }, { x: 10, y: 20, width: 100, height: 120 });
});

test("manifest preloads the WASM factory before MediaPipe", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const loader = scripts.indexOf("vendor/mediapipe/wasm/vision_wasm_internal.js");
  const mediaPipe = scripts.indexOf("vendor/mediapipe/vision_bundle.js");

  assert.ok(loader >= 0);
  assert.ok(loader < mediaPipe);
});

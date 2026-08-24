"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function createPreferences(seed = {}) {
  const values = { ...seed };
  const listeners = new Set();
  const window = { __DVH__: {} };
  const chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
        set: async (next) => Object.assign(values, structuredClone(next))
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener)
      }
    }
  };
  const context = vm.createContext({
    window,
    chrome,
    Set,
    Map,
    Date,
    Math,
    Object,
    Array,
    Number,
    Promise,
    setTimeout,
    clearTimeout
  });
  for (const file of ["src/shared/constants.js", "src/shared/storage.js", "src/content/state.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }
  return { state: window.__DVH__.state, values };
}

test("per-person face actions load from a key-value object", async () => {
  const fixture = createPreferences({
    "dvh.faceActions": { "id:123": "black", "name:mona": "full" }
  });
  await fixture.state.init();

  assert.equal(fixture.state.getFaceAction("id:123"), "black");
  assert.equal(fixture.state.getFaceAction("name:mona"), "full");
  assert.equal(fixture.state.getFaceAction("id:new"), "track");
});

test("face controls toggle tracking and blackout independently", async () => {
  const fixture = createPreferences();
  await fixture.state.init();

  fixture.state.toggleFaceTracking("id:1");
  assert.equal(fixture.state.getFaceAction("id:1"), "full");
  fixture.state.toggleFaceTracking("id:1");
  assert.equal(fixture.state.getFaceAction("id:1"), "track");
  fixture.state.toggleFaceBlackout("id:1");
  assert.equal(fixture.state.getFaceAction("id:1"), "black");
  fixture.state.toggleFaceBlackout("id:1");
  assert.equal(fixture.state.getFaceAction("id:1"), "track");

  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.deepEqual(fixture.values["dvh.faceActions"], {});
});

test("adaptive profile escalates per person and resets only after ten stable minutes", async () => {
  const fixture = createPreferences();
  await fixture.state.init();
  const start = 1_000_000;

  assert.deepEqual(structuredClone(fixture.state.getFaceProfile("id:2")), {
    level: 0,
    padding: 1.3,
    lostTimeoutMs: 2500,
    maxOcclusionMs: 5000,
    lastUnstableAt: 0,
    lastAdaptedAt: 0,
    movementEvents: 0,
    occlusionEvents: 0
  });

  fixture.state.noteFaceInstability("id:2", "movement", start);
  assert.deepEqual(structuredClone(fixture.state.getFaceProfile("id:2")), {
    level: 1,
    padding: 1.45,
    lostTimeoutMs: 3500,
    maxOcclusionMs: 7000,
    lastUnstableAt: start,
    lastAdaptedAt: start,
    movementEvents: 1,
    occlusionEvents: 0
  });

  fixture.state.noteFaceInstability("id:2", "occlusion", start + 30_000);
  assert.equal(fixture.state.getFaceProfile("id:2").level, 1);
  assert.equal(fixture.state.getFaceProfile("id:2").lastUnstableAt, start + 30_000);
  assert.equal(fixture.state.getFaceProfile("id:2").occlusionEvents, 1);

  fixture.state.noteFaceInstability("id:2", "occlusion", start + 61_000);
  assert.equal(fixture.state.getFaceProfile("id:2").level, 2);
  assert.equal(fixture.state.getFaceProfile("id:2").padding, 1.65);

  fixture.state.noteFaceStability("id:2", start + 61_000 + 599_999);
  assert.equal(fixture.state.getFaceProfile("id:2").level, 2);
  fixture.state.noteFaceStability("id:2", start + 61_000 + 600_001);
  assert.equal(fixture.state.getFaceProfile("id:2").level, 0);
});

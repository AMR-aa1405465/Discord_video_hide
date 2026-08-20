"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStorage(seed = {}) {
  const values = { ...seed };
  const listeners = new Set();
  const window = { __DVH__: {} };
  const chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
        set: async (next) => Object.assign(values, next)
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener)
      }
    }
  };
  const context = vm.createContext({ window, chrome, setTimeout, clearTimeout, Date, Object, Array, Number });
  for (const file of ["src/shared/constants.js", "src/shared/storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return { api: window.__DVH__.storage, values };
}

test("load returns defaults for empty storage", async () => {
  const { api } = createStorage();
  assert.deepEqual(structuredClone(await api.load()), {
    hidden: [],
    settings: { mode: "blur", blurStrength: 40, buttonVisibility: "hover", debug: false }
  });
});

test("load sanitizes damaged values", async () => {
  const { api } = createStorage({ "dvh.hiddenUsers": "bad", "dvh.settings": { mode: "wat", blurStrength: 900 } });
  const result = structuredClone(await api.load());
  assert.deepEqual(result.hidden, []);
  assert.deepEqual(result.settings, { mode: "blur", blurStrength: 80, buttonVisibility: "hover", debug: false });
});

test("debounced hidden save persists object metadata", async () => {
  const { api, values } = createStorage();
  const item = { key: "id:1", label: "x", strength: "strong", addedAt: 123 };
  await api.saveHidden([item]);
  assert.deepEqual(structuredClone(values["dvh.hiddenUsers"]), [item]);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function createState(initial) {
  let data = initial || {
    hidden: [],
    settings: { mode: "blur", blurStrength: 40, buttonVisibility: "hover", debug: false }
  };
  const values = {
    "dvh.hiddenUsers": data.hidden,
    "dvh.settings": data.settings
  };
  const storageListeners = new Set();
  const saved = [];
  const window = { __DVH__: {} };
  const chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.map((key) => [key, values[key]])),
        set: async (next) => {
          Object.assign(values, next);
          if (next["dvh.hiddenUsers"]) saved.push(structuredClone(next["dvh.hiddenUsers"]));
        }
      },
      onChanged: {
        addListener: (listener) => storageListeners.add(listener),
        removeListener: (listener) => storageListeners.delete(listener)
      }
    }
  };
  const context = vm.createContext({ window, chrome, Set, Map, Date, Object, Array, Number, setTimeout, clearTimeout });
  for (const file of ["src/shared/constants.js", "src/shared/storage.js", "src/content/state.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }
  return {
    api: window.__DVH__.state,
    saved,
    external: async (next) => {
      data = next;
      values["dvh.hiddenUsers"] = next.hidden;
      values["dvh.settings"] = next.settings;
      for (const listener of storageListeners) {
        listener({ "dvh.hiddenUsers": { newValue: next.hidden }, "dvh.settings": { newValue: next.settings } }, "local");
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

test("state initializes empty", async () => {
  const { api } = createState();
  await api.init();
  assert.equal(api.state.ready, true);
  assert.equal(api.state.hidden.size, 0);
});

test("toggle emits synchronously and toggles on and off", async () => {
  const { api, saved } = createState();
  await api.init();
  let emissions = 0;
  api.onChange(() => { emissions += 1; });
  api.toggle("id:1", { label: "Alex", strength: "strong" });
  assert.equal(api.isHidden("id:1"), true);
  assert.equal(emissions, 1);
  api.toggle("id:1");
  assert.equal(api.isHidden("id:1"), false);
  assert.equal(emissions, 2);
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], []);
});

test("state loads stored metadata", async () => {
  const { api } = createState({
    hidden: [{ key: "id:2", label: "Sam", strength: "strong", addedAt: 123 }],
    settings: { mode: "black", blurStrength: 60, buttonVisibility: "always", debug: true }
  });
  await api.init();
  assert.equal(api.isHidden("id:2"), true);
  assert.equal(api.state.meta.get("id:2").label, "Sam");
  assert.equal(api.getSettings().mode, "black");
});

test("external storage changes rebuild state and emit", async () => {
  const fixture = createState();
  await fixture.api.init();
  let emissions = 0;
  fixture.api.onChange(() => { emissions += 1; });
  await fixture.external({
    hidden: [{ key: "name:lee", label: "Lee", strength: "weak", addedAt: 1 }],
    settings: { mode: "blur", blurStrength: 24, buttonVisibility: "hover", debug: false }
  });
  assert.equal(fixture.api.isHidden("name:lee"), true);
  assert.equal(fixture.api.getSettings().blurStrength, 24);
  assert.equal(emissions, 1);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function trackedNode(counter) {
  const classes = new Set();
  return {
    children: [],
    dataset: new Proxy({}, { set(target, key, value) { counter.count += 1; target[key] = value; return true; } }),
    style: { setProperty() { counter.count += 1; } },
    classList: {
      add(value) { if (!classes.has(value)) { classes.add(value); counter.count += 1; } },
      remove(value) { if (classes.delete(value)) counter.count += 1; },
      toggle(value, force) {
        const before = classes.has(value);
        if (force) classes.add(value); else classes.delete(value);
        if (before !== classes.has(value)) counter.count += 1;
      }
    },
    set className(value) { value.split(/\s+/).filter(Boolean).forEach((item) => classes.add(item)); },
    set innerHTML(value) { this._html = value; counter.count += 1; },
    setAttribute() { counter.count += 1; },
    addEventListener() {},
    append(...nodes) { this.children.push(...nodes); counter.count += nodes.length; },
    remove() { counter.count += 1; }
  };
}

test("a repeated applyState is a DOM no-op", () => {
  const counter = { count: 0 };
  const registry = new WeakMap();
  const window = {
    __DVH__: {
      constants: { CLS: { ROOT: "dvh-root", HIDDEN: "dvh-hidden", OVERLAY: "dvh-overlay", BTN: "dvh-btn", BTN_ON: "dvh-btn--on", FALLBACK: "dvh-fallback" } },
      registry: { set: (tile, record) => registry.set(tile, record), delete: (tile) => registry.delete(tile) },
      state: { toggle() {} }
    }
  };
  const document = { createElement: () => trackedNode(counter) };
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ position: "static" }), CSS: { supports: () => true } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/content/overlay.js"), "utf8"), context);
  const tile = trackedNode(counter);
  const record = window.__DVH__.overlay.decorate(tile, { key: "id:1", label: "A", strength: "strong" });
  window.__DVH__.overlay.applyState(tile, record, { hidden: true, mode: "blur", blurStrength: 40, buttonVisibility: "hover" });
  counter.count = 0;
  window.__DVH__.overlay.applyState(tile, record, { hidden: true, mode: "blur", blurStrength: 40, buttonVisibility: "hover" });
  assert.equal(counter.count, 0);
});

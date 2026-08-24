"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function trackedNode(counter) {
  const classes = new Set();
  const listeners = new Map();
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
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) {
      const listener = listeners.get(type);
      if (listener) listener({ stopPropagation() {}, preventDefault() {} });
    },
    hasClass(value) { return classes.has(value); },
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
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ position: "static" }), CSS: { supports: () => true }, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/content/overlay.js"), "utf8"), context);
  const tile = trackedNode(counter);
  const record = window.__DVH__.overlay.decorate(tile, { key: "id:1", label: "A", strength: "strong" });
  window.__DVH__.overlay.applyState(tile, record, { hidden: true, mode: "blur", blurStrength: 40, buttonVisibility: "hover" });
  counter.count = 0;
  window.__DVH__.overlay.applyState(tile, record, { hidden: true, mode: "blur", blurStrength: 40, buttonVisibility: "hover" });
  assert.equal(counter.count, 0);
});

test("face-only mode starts tracking and leaving it stops tracking", () => {
  const counter = { count: 0 };
  const calls = [];
  const registry = new WeakMap();
  const window = {
    __DVH__: {
      constants: { CLS: { ROOT: "dvh-root", HIDDEN: "dvh-hidden", OVERLAY: "dvh-overlay", BTN: "dvh-btn", BTN_ON: "dvh-btn--on", FALLBACK: "dvh-fallback" } },
      registry: { set: (tile, record) => registry.set(tile, record), delete: (tile) => registry.delete(tile) },
      state: { toggle() {}, toggleFaceTracking() {}, toggleFaceBlackout() {} },
      faceZoomController: {
        start(record) { calls.push(["start", record.key]); },
        stop(record) { calls.push(["stop", record.key]); }
      }
    }
  };
  const document = { createElement: () => trackedNode(counter) };
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ position: "static" }), CSS: { supports: () => true } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/content/overlay.js"), "utf8"), context);
  const tile = trackedNode(counter);
  const video = { videoWidth: 1280, videoHeight: 720 };
  const record = window.__DVH__.overlay.decorate(tile, { key: "id:2", label: "B", strength: "strong" }, video);

  window.__DVH__.overlay.applyState(tile, record, {
    hidden: false,
    mode: "face",
    faceAction: "track",
    faceProfile: { level: 0, padding: 1.3, lostTimeoutMs: 2500, maxOcclusionMs: 5000 },
    blurStrength: 40,
    buttonVisibility: "hover"
  });
  window.__DVH__.overlay.applyState(tile, record, { hidden: false, mode: "black", blurStrength: 40, buttonVisibility: "hover" });

  assert.deepEqual(calls, [["start", "id:2"], ["stop", "id:2"]]);
});

test("face mode exposes remembered tracking and blackout controls", () => {
  const counter = { count: 0 };
  const actions = [];
  const registry = new WeakMap();
  const window = {
    __DVH__: {
      constants: { CLS: { ROOT: "dvh-root", HIDDEN: "dvh-hidden", OVERLAY: "dvh-overlay", BTN: "dvh-btn", BTN_ON: "dvh-btn--on", FALLBACK: "dvh-fallback" } },
      registry: { set: (tile, record) => registry.set(tile, record), delete: (tile) => registry.delete(tile) },
      state: {
        toggle() {},
        toggleFaceTracking(key) { actions.push(["tracking", key]); },
        toggleFaceBlackout(key) { actions.push(["blackout", key]); }
      },
      faceZoomController: { start() {}, stop() {} }
    }
  };
  const document = { createElement: () => trackedNode(counter) };
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ position: "static" }), CSS: { supports: () => true } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/content/overlay.js"), "utf8"), context);
  const tile = trackedNode(counter);
  const record = window.__DVH__.overlay.decorate(
    tile,
    { key: "id:3", label: "C", strength: "strong" },
    { videoWidth: 1280, videoHeight: 720 }
  );
  const base = {
    hidden: false,
    mode: "face",
    faceProfile: { level: 0, padding: 1.3, lostTimeoutMs: 2500, maxOcclusionMs: 5000 },
    blurStrength: 40,
    buttonVisibility: "hover"
  };

  window.__DVH__.overlay.applyState(tile, record, { ...base, faceAction: "track" });
  assert.equal(record.btnEl.hasClass("dvh-btn--face-action"), true);
  assert.equal(record.blackBtnEl.hasClass("dvh-btn--face-action"), true);
  record.btnEl.dispatch("click");
  record.blackBtnEl.dispatch("click");
  assert.deepEqual(actions, [["tracking", "id:3"], ["blackout", "id:3"]]);

  window.__DVH__.overlay.applyState(tile, record, { ...base, faceAction: "full" });
  assert.equal(record.overlayEl.hasClass("dvh-hidden"), false);
  window.__DVH__.overlay.applyState(tile, record, { ...base, faceAction: "black" });
  assert.equal(record.overlayEl.dataset.mode, "black");
  assert.equal(record.overlayEl.hasClass("dvh-hidden"), true);
});

test("tracking-status toggle shows per-person profile details", () => {
  const counter = { count: 0 };
  const registry = new WeakMap();
  const window = {
    __DVH__: {
      constants: {
        CLS: { ROOT: "dvh-root", HIDDEN: "dvh-hidden", OVERLAY: "dvh-overlay", BTN: "dvh-btn", BTN_ON: "dvh-btn--on", FALLBACK: "dvh-fallback" },
        FACE_PROFILE_LEVELS: [{}, {}, {}, {}]
      },
      registry: { set: (tile, record) => registry.set(tile, record), delete: (tile) => registry.delete(tile) },
      state: { toggle() {}, toggleFaceTracking() {}, toggleFaceBlackout() {} }
    }
  };
  const document = { createElement: () => trackedNode(counter) };
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ position: "static" }), CSS: { supports: () => true }, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/content/overlay.js"), "utf8"), context);
  const tile = trackedNode(counter);
  const record = window.__DVH__.overlay.decorate(tile, { key: "id:4", label: "Mona", strength: "strong" });

  window.__DVH__.overlay.applyState(tile, record, {
    mode: "face",
    faceAction: "track",
    faceProfile: {
      level: 1,
      padding: 1.45,
      lostTimeoutMs: 3500,
      maxOcclusionMs: 7000,
      movementEvents: 2,
      occlusionEvents: 1,
      lastReason: "movement",
      lastUnstableAt: 1000,
      lastAdaptedAt: 1000
    },
    showTrackingStatus: true
  });

  assert.equal(record.statusEl.hidden, false);
  assert.match(record.statusEl.textContent, /Mona/);
  assert.match(record.statusEl.textContent, /Crop 1\.45×/);
  assert.match(record.statusEl.textContent, /Frequent movement detected — profile increased/);

  window.__DVH__.overlay.applyState(tile, record, {
    mode: "face",
    faceAction: "track",
    faceProfile: { level: 1, padding: 1.45, lostTimeoutMs: 3500, maxOcclusionMs: 7000 },
    showTrackingStatus: false
  });
  assert.equal(record.statusEl.hidden, true);
});

test("face zoom never starts for the signed-in user's own video", () => {
  const counter = { count: 0 };
  const calls = [];
  const registry = new WeakMap();
  const window = {
    __DVH__: {
      constants: { CLS: { ROOT: "dvh-root", HIDDEN: "dvh-hidden", OVERLAY: "dvh-overlay", BTN: "dvh-btn", BTN_ON: "dvh-btn--on", FALLBACK: "dvh-fallback" } },
      registry: { set: (tile, record) => registry.set(tile, record), delete: (tile) => registry.delete(tile) },
      state: { toggle() {}, toggleFaceTracking() {}, toggleFaceBlackout() {} },
      faceZoomController: {
        start() { calls.push("start"); },
        stop() { calls.push("stop"); }
      }
    }
  };
  const document = { createElement: () => trackedNode(counter) };
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ position: "static" }), CSS: { supports: () => true } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/content/overlay.js"), "utf8"), context);
  const tile = trackedNode(counter);
  const record = window.__DVH__.overlay.decorate(tile, { key: "id:self", label: "Me", strength: "strong" });

  window.__DVH__.overlay.applyState(tile, record, {
    mode: "face",
    faceAction: "track",
    faceProfile: { level: 0, padding: 1.3, lostTimeoutMs: 2500, maxOcclusionMs: 5000 },
    isCurrentUser: true
  });

  assert.deepEqual(calls, ["stop"]);
  assert.equal(record.overlayEl.hasClass("dvh-hidden"), false);
  assert.match(record.btnEl.title, /disabled for your own video/);
});

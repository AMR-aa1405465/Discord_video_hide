(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const listeners = new Set();
  let unsubscribe = null;

  const state = {
    hidden: new Set(),
    meta: new Map(),
    settings: { ...DVH.constants.DEFAULT_SETTINGS },
    ready: false
  };

  function rebuildHidden(items) {
    state.hidden.clear();
    state.meta.clear();
    for (const item of items) {
      state.hidden.add(item.key);
      state.meta.set(item.key, {
        label: item.label,
        strength: item.strength,
        addedAt: item.addedAt
      });
    }
  }

  function emit() {
    for (const listener of [...listeners]) listener();
  }

  async function refresh() {
    const data = await DVH.storage.load();
    rebuildHidden(data.hidden);
    state.settings = data.settings;
    emit();
  }

  async function init() {
    if (state.ready) return;
    const data = await DVH.storage.load();
    rebuildHidden(data.hidden);
    state.settings = data.settings;
    state.ready = true;
    unsubscribe = DVH.storage.subscribe(() => {
      refresh().catch(() => {});
    });
  }

  function serializeHidden() {
    return [...state.hidden].map((key) => ({ key, ...state.meta.get(key) }));
  }

  function toggle(key, identityMeta) {
    if (!key) return;
    if (state.hidden.has(key)) {
      state.hidden.delete(key);
      state.meta.delete(key);
    } else {
      const source = identityMeta || {};
      state.hidden.add(key);
      state.meta.set(key, {
        label: source.label || key,
        strength: source.strength === "strong" ? "strong" : "weak",
        addedAt: Number.isFinite(source.addedAt) ? source.addedAt : Date.now()
      });
    }
    DVH.storage.saveHidden(serializeHidden()).catch(() => {});
    emit();
  }

  function isHidden(key) {
    return state.hidden.has(key);
  }

  function getSettings() {
    return state.settings;
  }

  function onChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  function destroy() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    listeners.clear();
  }

  DVH.state = { state, init, toggle, isHidden, getSettings, onChange, destroy };
})();

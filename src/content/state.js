(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const listeners = new Set();
  const INSTABILITY_SAMPLE_INTERVAL_MS = 5000;
  let unsubscribe = null;

  const state = {
    hidden: new Set(),
    meta: new Map(),
    faceActions: new Map(),
    faceProfiles: new Map(),
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

  function rebuildFacePreferences(data) {
    state.faceActions = new Map(Object.entries(data.faceActions || {}));
    state.faceProfiles = new Map(Object.entries(data.faceProfiles || {}));
  }

  async function refresh() {
    const data = await DVH.storage.load();
    rebuildHidden(data.hidden);
    rebuildFacePreferences(data);
    state.settings = data.settings;
    emit();
  }

  async function init() {
    if (state.ready) return;
    const data = await DVH.storage.load();
    rebuildHidden(data.hidden);
    rebuildFacePreferences(data);
    state.settings = data.settings;
    state.ready = true;
    unsubscribe = DVH.storage.subscribe(() => {
      refresh().catch(() => {});
    });
  }

  function serializeHidden() {
    return [...state.hidden].map((key) => ({ key, ...state.meta.get(key) }));
  }

  function serializeMap(map) {
    return Object.fromEntries(map.entries());
  }

  function getFaceAction(key) {
    const action = state.faceActions.get(key);
    return action === "full" || action === "black" ? action : "track";
  }

  function setFaceAction(key, action) {
    if (!key) return;
    if (action === "full" || action === "black") state.faceActions.set(key, action);
    else state.faceActions.delete(key);
    DVH.storage.saveFaceActions(serializeMap(state.faceActions)).catch(() => {});
    emit();
  }

  function toggleFaceTracking(key) {
    setFaceAction(key, getFaceAction(key) === "track" ? "full" : "track");
  }

  function toggleFaceBlackout(key) {
    setFaceAction(key, getFaceAction(key) === "black" ? "track" : "black");
  }

  function profileAtLevel(level, source) {
    const levels = DVH.constants.FACE_PROFILE_LEVELS;
    const normalizedLevel = Math.min(levels.length - 1, Math.max(0, Math.floor(level) || 0));
    const tuning = levels[normalizedLevel];
    const current = source || {};
    return {
      level: normalizedLevel,
      padding: tuning.padding,
      lostTimeoutMs: tuning.lostTimeoutMs,
      maxOcclusionMs: tuning.maxOcclusionMs,
      lastUnstableAt: Math.max(0, Number(current.lastUnstableAt) || 0),
      lastAdaptedAt: Math.max(0, Number(current.lastAdaptedAt) || 0),
      movementEvents: Math.max(0, Math.floor(Number(current.movementEvents) || 0)),
      occlusionEvents: Math.max(0, Math.floor(Number(current.occlusionEvents) || 0))
    };
  }

  function getFaceProfile(key) {
    return profileAtLevel((state.faceProfiles.get(key) || {}).level || 0, state.faceProfiles.get(key));
  }

  function saveFaceProfiles() {
    DVH.storage.saveFaceProfiles(serializeMap(state.faceProfiles)).catch(() => {});
  }

  function noteFaceInstability(key, reason, now) {
    if (!key || (reason !== "movement" && reason !== "occlusion")) return;
    const timestamp = Number.isFinite(now) ? now : Date.now();
    const current = getFaceProfile(key);
    if (current.lastUnstableAt > 0 && timestamp - current.lastUnstableAt < INSTABILITY_SAMPLE_INTERVAL_MS) return;
    const mayEscalate = current.lastAdaptedAt <= 0 || timestamp - current.lastAdaptedAt >= 60000;
    const next = profileAtLevel(mayEscalate ? current.level + 1 : current.level, current);
    next.lastUnstableAt = timestamp;
    if (mayEscalate) next.lastAdaptedAt = timestamp;
    if (reason === "movement") next.movementEvents += 1;
    else next.occlusionEvents += 1;
    state.faceProfiles.set(key, next);
    saveFaceProfiles();
    emit();
  }

  function noteFaceStability(key, now) {
    if (!key) return;
    const current = state.faceProfiles.get(key);
    if (!current || current.level <= 0) return;
    const timestamp = Number.isFinite(now) ? now : Date.now();
    if (timestamp - current.lastUnstableAt < 600000) return;
    const next = profileAtLevel(0, current);
    state.faceProfiles.set(key, next);
    saveFaceProfiles();
    emit();
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

  DVH.state = {
    state,
    init,
    toggle,
    isHidden,
    getSettings,
    getFaceAction,
    setFaceAction,
    toggleFaceTracking,
    toggleFaceBlackout,
    getFaceProfile,
    noteFaceInstability,
    noteFaceStability,
    onChange,
    destroy
  };
})();

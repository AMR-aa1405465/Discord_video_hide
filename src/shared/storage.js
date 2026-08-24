(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const { STORAGE_KEYS, DEFAULT_SETTINGS, FACE_PROFILE_LEVELS } = DVH.constants;
  let hiddenTimer = null;
  let queuedHidden = [];
  let pendingResolvers = [];

  function validHidden(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item.key === "string" && item.key.length > 0)
      .map((item) => ({
        key: item.key,
        label: typeof item.label === "string" && item.label ? item.label : item.key,
        strength: item.strength === "strong" ? "strong" : "weak",
        addedAt: Number.isFinite(item.addedAt) ? item.addedAt : Date.now()
      }));
  }

  function validSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      mode: source.mode === "black" || source.mode === "face" ? source.mode : DEFAULT_SETTINGS.mode,
      blurStrength: Number.isFinite(source.blurStrength)
        ? Math.min(80, Math.max(8, source.blurStrength))
        : DEFAULT_SETTINGS.blurStrength,
      buttonVisibility: source.buttonVisibility === "always" ? "always" : DEFAULT_SETTINGS.buttonVisibility,
      debug: source.debug === true
    };
  }

  function validFaceActions(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [key, action] of Object.entries(value)) {
      if (!key || (action !== "full" && action !== "black" && action !== "track")) continue;
      if (action !== "track") result[key] = action;
    }
    return result;
  }

  function validFaceProfile(value) {
    const source = value && typeof value === "object" ? value : {};
    const level = Math.min(FACE_PROFILE_LEVELS.length - 1, Math.max(0, Math.floor(Number(source.level) || 0)));
    const tuning = FACE_PROFILE_LEVELS[level];
    return {
      level,
      padding: tuning.padding,
      lostTimeoutMs: tuning.lostTimeoutMs,
      maxOcclusionMs: tuning.maxOcclusionMs,
      lastUnstableAt: Math.max(0, Number(source.lastUnstableAt) || 0),
      lastAdaptedAt: Math.max(0, Number(source.lastAdaptedAt) || 0),
      movementEvents: Math.max(0, Math.floor(Number(source.movementEvents) || 0)),
      occlusionEvents: Math.max(0, Math.floor(Number(source.occlusionEvents) || 0))
    };
  }

  function validFaceProfiles(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [key, profile] of Object.entries(value)) {
      if (key) result[key] = validFaceProfile(profile);
    }
    return result;
  }

  async function load() {
    try {
      const values = await chrome.storage.local.get([
        STORAGE_KEYS.HIDDEN,
        STORAGE_KEYS.SETTINGS,
        STORAGE_KEYS.FACE_ACTIONS,
        STORAGE_KEYS.FACE_PROFILES
      ]);
      return {
        hidden: validHidden(values[STORAGE_KEYS.HIDDEN]),
        settings: validSettings(values[STORAGE_KEYS.SETTINGS]),
        faceActions: validFaceActions(values[STORAGE_KEYS.FACE_ACTIONS]),
        faceProfiles: validFaceProfiles(values[STORAGE_KEYS.FACE_PROFILES])
      };
    } catch (_error) {
      return { hidden: [], settings: { ...DEFAULT_SETTINGS }, faceActions: {}, faceProfiles: {} };
    }
  }

  function saveHidden(hidden) {
    queuedHidden = validHidden(hidden);
    if (hiddenTimer !== null) clearTimeout(hiddenTimer);

    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
      hiddenTimer = setTimeout(async () => {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        hiddenTimer = null;
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.HIDDEN]: queuedHidden });
          resolvers.forEach((item) => item.resolve());
        } catch (error) {
          resolvers.forEach((item) => item.reject(error));
        }
      }, 300);
    });
  }

  async function saveSettings(partial) {
    const current = await load();
    const settings = validSettings({ ...current.settings, ...(partial || {}) });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
    return settings;
  }

  async function saveFaceActions(actions) {
    const value = validFaceActions(actions);
    await chrome.storage.local.set({ [STORAGE_KEYS.FACE_ACTIONS]: value });
    return value;
  }

  async function saveFaceProfiles(profiles) {
    const value = validFaceProfiles(profiles);
    await chrome.storage.local.set({ [STORAGE_KEYS.FACE_PROFILES]: value });
    return value;
  }

  function subscribe(callback) {
    const listener = (changes, areaName) => {
      if (areaName !== "local") return;
      if (
        changes[STORAGE_KEYS.HIDDEN] ||
        changes[STORAGE_KEYS.SETTINGS] ||
        changes[STORAGE_KEYS.FACE_ACTIONS] ||
        changes[STORAGE_KEYS.FACE_PROFILES]
      ) callback(changes);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  DVH.storage = { load, saveHidden, saveSettings, saveFaceActions, saveFaceProfiles, subscribe };
})();

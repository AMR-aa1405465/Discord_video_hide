(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const { STORAGE_KEYS, DEFAULT_SETTINGS } = DVH.constants;
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

  async function load() {
    try {
      const values = await chrome.storage.local.get([STORAGE_KEYS.HIDDEN, STORAGE_KEYS.SETTINGS]);
      return {
        hidden: validHidden(values[STORAGE_KEYS.HIDDEN]),
        settings: validSettings(values[STORAGE_KEYS.SETTINGS])
      };
    } catch (_error) {
      return { hidden: [], settings: { ...DEFAULT_SETTINGS } };
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

  function subscribe(callback) {
    const listener = (changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[STORAGE_KEYS.HIDDEN] || changes[STORAGE_KEYS.SETTINGS]) callback(changes);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  DVH.storage = { load, saveHidden, saveSettings, subscribe };
})();

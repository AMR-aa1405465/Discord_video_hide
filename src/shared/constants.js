(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});

  DVH.constants = Object.freeze({
    STORAGE_KEYS: Object.freeze({
      HIDDEN: "dvh.hiddenUsers",
      SETTINGS: "dvh.settings"
    }),
    DEFAULT_SETTINGS: Object.freeze({
      mode: "blur",
      blurStrength: 40,
      buttonVisibility: "hover",
      debug: false
    }),
    CLS: Object.freeze({
      ROOT: "dvh-root",
      HIDDEN: "dvh-hidden",
      OVERLAY: "dvh-overlay",
      BTN: "dvh-btn",
      BTN_ON: "dvh-btn--on",
      FALLBACK: "dvh-fallback"
    }),
    ATTR: Object.freeze({
      BOUND: "data-dvh-bound",
      KEY: "data-dvh-key"
    })
  });
})();

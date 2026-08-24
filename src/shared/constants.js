(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});

  DVH.constants = Object.freeze({
    STORAGE_KEYS: Object.freeze({
      HIDDEN: "dvh.hiddenUsers",
      SETTINGS: "dvh.settings",
      FACE_ACTIONS: "dvh.faceActions",
      FACE_PROFILES: "dvh.faceProfiles"
    }),
    DEFAULT_SETTINGS: Object.freeze({
      mode: "blur",
      blurStrength: 40,
      buttonVisibility: "hover",
      showTrackingStatus: false,
      debug: false
    }),
    FACE_PROFILE_LEVELS: Object.freeze([
      Object.freeze({ padding: 1.3, lostTimeoutMs: 2500, maxOcclusionMs: 5000 }),
      Object.freeze({ padding: 1.45, lostTimeoutMs: 3500, maxOcclusionMs: 7000 }),
      Object.freeze({ padding: 1.65, lostTimeoutMs: 5000, maxOcclusionMs: 10000 }),
      Object.freeze({ padding: 1.85, lostTimeoutMs: 7000, maxOcclusionMs: 15000 })
    ]),
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

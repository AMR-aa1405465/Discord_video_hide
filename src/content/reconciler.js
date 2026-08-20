(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  let observer = null;
  let timer = null;
  let frame = null;
  let heartbeat = null;
  let removeStateListener = null;
  let started = false;
  let warnedCollision = false;

  function observe() {
    if (observer && document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function reconcile() {
    if (!DVH.state.state.ready) return;
    if (observer) observer.disconnect();
    try {
      const settings = DVH.state.getSettings();
      const tiles = DVH.tileFinder.findVideoTiles();
      // Two different tiles must never resolve to the same key -- that is exactly
      // what makes one click hide every participant. Detect it and isolate.
      const keysThisPass = new Map();

      tiles.forEach((tile, index) => {
        try {
          let identity = DVH.identity.resolveIdentity(tile);
          if (!identity) return;

          const owner = keysThisPass.get(identity.key);
          if (owner && owner !== tile) {
            if (!warnedCollision) {
              warnedCollision = true;
              console.warn(
                "[DVH] Two tiles resolved to the same identity key (" + identity.key + "). " +
                "Falling back to positional keys so the toggle stays per-participant. " +
                "Run __DVH__.tileFinder.diag() and share the output to fix identity detection."
              );
            }
            identity = Object.assign({}, identity, {
              key: identity.key + "@" + index,
              strength: "weak",
              collision: true
            });
          }
          keysThisPass.set(identity.key, tile);

          let record = DVH.registry.get(tile);
          if (record && record.key !== identity.key) {
            DVH.overlay.destroy(tile, record);
            record = null;
          }
          if (!record) record = DVH.overlay.decorate(tile, identity);

          DVH.overlay.applyState(tile, record, {
            hidden: DVH.state.isHidden(identity.key),
            mode: settings.mode,
            blurStrength: settings.blurStrength,
            buttonVisibility: settings.buttonVisibility
          });
        } catch (error) {
          if (settings.debug) console.debug("[DVH] tile reconciliation failed", error, tile);
        }
      });
    } finally {
      observe();
    }
  }

  function scheduleReconcile() {
    if (frame !== null || timer !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      timer = setTimeout(() => {
        timer = null;
        reconcile();
      }, 120);
    });
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") reconcile();
  }

  function start() {
    if (started || !document.body) return;
    started = true;
    observer = new MutationObserver(scheduleReconcile);
    observe();
    removeStateListener = DVH.state.onChange(reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);
    heartbeat = setInterval(scheduleReconcile, 2000);
    reconcile();
  }

  function stop() {
    if (observer) observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    if (heartbeat !== null) clearInterval(heartbeat);
    if (removeStateListener) removeStateListener();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    observer = null;
    frame = null;
    timer = null;
    heartbeat = null;
    removeStateListener = null;
    started = false;
  }

  DVH.reconciler = { reconcile, scheduleReconcile, start, stop };
})();

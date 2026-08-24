(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const { CLS } = DVH.constants;
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.3 2 18.7 18.7-1.3 1.3-3.2-3.2A11.8 11.8 0 0 1 12 20C5.5 20 2 14 2 14a18 18 0 0 1 3.3-4.2L2 6.3 3.3 5l18.7 18.7-1.3 1.3L3.3 7.3V2Zm5 10.8A3.8 3.8 0 0 0 13.2 17l-4.9-4.2ZM12 8c6.5 0 10 6 10 6a17 17 0 0 1-2.2 3.1l-2.7-2.7V14A5.1 5.1 0 0 0 10 9.2L8.4 7.9A12 12 0 0 1 12 8Z"/></svg>';

  function decorate(tile, identity, video) {
    const overlayEl = document.createElement("div");
    overlayEl.className = CLS.OVERLAY;
    overlayEl.setAttribute("aria-hidden", "true");

    const canvasEl = document.createElement("canvas");
    canvasEl.className = "dvh-face-canvas";
    canvasEl.hidden = true;
    overlayEl.append(canvasEl);

    const btnEl = document.createElement("button");
    btnEl.className = CLS.BTN;
    btnEl.type = "button";
    btnEl.setAttribute("aria-pressed", "false");
    btnEl.title = "Hide video";
    btnEl.innerHTML = EYE_OFF;

    const record = {
      key: identity.key,
      identity,
      tileEl: tile,
      videoEl: video || null,
      overlayEl,
      canvasEl,
      btnEl,
      rootAdded: false,
      appliedHidden: null,
      appliedMode: null,
      appliedStrength: null,
      appliedButtonVisibility: null
    };

    btnEl.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
    });
    btnEl.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      DVH.state.toggle(record.key, record.identity);
    });

    if (getComputedStyle(tile).position === "static") {
      tile.classList.add(CLS.ROOT);
      record.rootAdded = true;
    }
    tile.append(overlayEl, btnEl);
    DVH.registry.set(tile, record);
    return record;
  }

  function destroy(tile, record) {
    if (DVH.faceZoomController) DVH.faceZoomController.stop(record);
    record.overlayEl.remove();
    record.btnEl.remove();
    if (record.rootAdded) tile.classList.remove(CLS.ROOT);
    DVH.registry.delete(tile);
  }

  function applyState(_tile, record, options) {
    const mode = options.mode === "black" || options.mode === "face" ? options.mode : "blur";
    const hidden = mode === "face" || options.hidden === true;
    const strength = Math.min(80, Math.max(8, Number(options.blurStrength) || 40));
    const buttonVisibility = options.buttonVisibility === "always" ? "always" : "hover";
    if (
      record.appliedHidden === hidden &&
      record.appliedMode === mode &&
      record.appliedStrength === strength &&
      record.appliedButtonVisibility === buttonVisibility
    ) return;

    record.overlayEl.classList.toggle(CLS.HIDDEN, hidden);
    record.btnEl.classList.toggle(CLS.BTN_ON, hidden);
    record.btnEl.classList.toggle("dvh-btn--always", buttonVisibility === "always");
    record.btnEl.classList.toggle("dvh-btn--face-auto", mode === "face");
    record.overlayEl.dataset.mode = mode;
    record.overlayEl.style.setProperty("--dvh-blur", `${strength}px`);
    record.overlayEl.classList.toggle(CLS.FALLBACK, mode === "blur" && !CSS.supports("backdrop-filter", "blur(1px)"));
    if (DVH.faceZoomController) {
      if (hidden && mode === "face") DVH.faceZoomController.start(record);
      else DVH.faceZoomController.stop(record);
    }
    record.btnEl.setAttribute("aria-pressed", String(hidden));
    record.btnEl.title = hidden ? "Show video" : "Hide video";
    record.btnEl.innerHTML = hidden ? EYE : EYE_OFF;
    record.appliedHidden = hidden;
    record.appliedMode = mode;
    record.appliedStrength = strength;
    record.appliedButtonVisibility = buttonVisibility;
  }

  DVH.overlay = { decorate, destroy, applyState };
})();

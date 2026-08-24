(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const { CLS } = DVH.constants;
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.3 2 18.7 18.7-1.3 1.3-3.2-3.2A11.8 11.8 0 0 1 12 20C5.5 20 2 14 2 14a18 18 0 0 1 3.3-4.2L2 6.3 3.3 5l18.7 18.7-1.3 1.3L3.3 7.3V2Zm5 10.8A3.8 3.8 0 0 0 13.2 17l-4.9-4.2ZM12 8c6.5 0 10 6 10 6a17 17 0 0 1-2.2 3.1l-2.7-2.7V14A5.1 5.1 0 0 0 10 9.2L8.4 7.9A12 12 0 0 1 12 8Z"/></svg>';
  const BLACKOUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>';

  function stopPointerEvent(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  function seconds(milliseconds) {
    const value = Math.max(0, Number(milliseconds) || 0) / 1000;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function reasonLabel(profile, maxLevel) {
    const reason = profile && profile.lastReason;
    const adapted = Number(profile && profile.lastAdaptedAt) > 0 &&
      Number(profile && profile.lastAdaptedAt) === Number(profile && profile.lastUnstableAt);
    if (reason === "movement") {
      const movement = Number(profile.movementEvents) > 1 ? "Frequent movement detected" : "Large movement detected";
      if (adapted && Number(profile.level) >= maxLevel) return `${movement} — maximum profile reached`;
      return adapted ? `${movement} — profile increased` : `${movement} — level unchanged`;
    }
    if (reason === "occlusion") {
      if (adapted && Number(profile.level) >= maxLevel) return "Face occlusion detected — maximum profile reached";
      return adapted ? "Face occlusion detected — profile increased" : "Face occlusion detected — level unchanged";
    }
    if (reason === "stable") return "Stable for 10 minutes — profile reset";
    return "No automatic adjustments yet";
  }

  function phaseLabel(phase) {
    if (phase === "tracking") return "Tracking face";
    if (phase === "motion") return "Face hidden — following motion";
    if (phase === "holding") return "Face temporarily lost — holding crop";
    if (phase === "fallback") return "Face not found — showing full video";
    if (phase === "paused") return "Face tracking paused for this person";
    if (phase === "black") return "Video blacked out for this person";
    if (phase === "inactive") return "Switch to Face only to start tracking";
    if (phase === "self") return "Your video — face zoom is disabled";
    return "Looking for a stable face";
  }

  function clearStatusTimer(record) {
    if (record.statusTimer !== null) clearTimeout(record.statusTimer);
    if (record.statusHideTimer !== null) clearTimeout(record.statusHideTimer);
    record.statusTimer = null;
    record.statusHideTimer = null;
  }

  function updateTrackingStatus(record, update, force) {
    if (!record || !record.statusEl) return;
    if (update) record.trackingRuntime = { ...(record.trackingRuntime || {}), ...update };
    if (!record.trackingStatusEnabled) {
      clearStatusTimer(record);
      record.statusEl.hidden = true;
      return;
    }

    const profile = record.trackingProfile || {};
    const runtime = record.trackingRuntime || {};
    const maxLevel = Math.max(0, DVH.constants.FACE_PROFILE_LEVELS.length - 1);
    const label = record.identity && record.identity.label ? record.identity.label : "Participant";
    const reason = reasonLabel(profile, maxLevel);
    const text = [
      `${label} · ${phaseLabel(runtime.phase)}`,
      `Crop ${Number(profile.padding) || 1.3}× · Lost ${seconds(profile.lostTimeoutMs)}s · Occlusion ${seconds(profile.maxOcclusionMs)}s`,
      `Level ${Number(profile.level) || 0}/${maxLevel} · ${reason}`
    ].join("\n");
    const changed = record.statusEl.textContent !== text;
    if (!changed && force !== true) return;

    record.statusEl.textContent = text;
    record.statusEl.title = `Movement events: ${Number(profile.movementEvents) || 0}; occlusion events: ${Number(profile.occlusionEvents) || 0}`;
    clearStatusTimer(record);
    record.statusEl.classList.remove("dvh-tracking-status--leaving");
    record.statusEl.hidden = false;
    record.statusTimer = setTimeout(() => {
      record.statusEl.classList.add("dvh-tracking-status--leaving");
      record.statusHideTimer = setTimeout(() => {
        record.statusEl.hidden = true;
        record.statusEl.classList.remove("dvh-tracking-status--leaving");
        record.statusHideTimer = null;
      }, 300);
      record.statusTimer = null;
    }, 6000);
  }

  function decorate(tile, identity, video) {
    const overlayEl = document.createElement("div");
    overlayEl.className = CLS.OVERLAY;
    overlayEl.setAttribute("aria-hidden", "true");

    const canvasEl = document.createElement("canvas");
    canvasEl.className = "dvh-face-canvas";
    canvasEl.hidden = true;
    overlayEl.append(canvasEl);

    const statusEl = document.createElement("div");
    statusEl.className = "dvh-tracking-status";
    statusEl.hidden = true;

    const btnEl = document.createElement("button");
    btnEl.className = CLS.BTN;
    btnEl.type = "button";
    btnEl.setAttribute("aria-pressed", "false");
    btnEl.title = "Hide video";
    btnEl.innerHTML = EYE_OFF;

    const blackBtnEl = document.createElement("button");
    blackBtnEl.className = `${CLS.BTN} dvh-btn--blackout`;
    blackBtnEl.type = "button";
    blackBtnEl.setAttribute("aria-pressed", "false");
    blackBtnEl.title = "Blackout entire video";
    blackBtnEl.innerHTML = BLACKOUT;

    const record = {
      key: identity.key,
      identity,
      tileEl: tile,
      videoEl: video || null,
      overlayEl,
      canvasEl,
      btnEl,
      blackBtnEl,
      statusEl,
      trackingProfile: null,
      trackingRuntime: { phase: "starting" },
      trackingStatusEnabled: false,
      statusTimer: null,
      statusHideTimer: null,
      isCurrentUser: false,
      rootAdded: false,
      appliedHidden: null,
      appliedMode: null,
      appliedFaceAction: null,
      appliedFaceProfile: null,
      appliedStrength: null,
      appliedButtonVisibility: null,
      appliedTrackingStatus: null,
      appliedIsCurrentUser: null
    };

    btnEl.addEventListener("pointerdown", stopPointerEvent);
    btnEl.addEventListener("click", (event) => {
      stopPointerEvent(event);
      if (record.appliedMode === "face" && record.isCurrentUser) return;
      if (record.appliedMode === "face") DVH.state.toggleFaceTracking(record.key);
      else DVH.state.toggle(record.key, record.identity);
    });
    blackBtnEl.addEventListener("pointerdown", stopPointerEvent);
    blackBtnEl.addEventListener("click", (event) => {
      stopPointerEvent(event);
      DVH.state.toggleFaceBlackout(record.key);
    });

    if (getComputedStyle(tile).position === "static") {
      tile.classList.add(CLS.ROOT);
      record.rootAdded = true;
    }
    tile.append(overlayEl, btnEl, blackBtnEl, statusEl);
    DVH.registry.set(tile, record);
    return record;
  }

  function destroy(tile, record) {
    if (DVH.faceZoomController) DVH.faceZoomController.stop(record);
    clearStatusTimer(record);
    record.overlayEl.remove();
    record.btnEl.remove();
    record.blackBtnEl.remove();
    record.statusEl.remove();
    if (record.rootAdded) tile.classList.remove(CLS.ROOT);
    DVH.registry.delete(tile);
  }

  function applyState(_tile, record, options) {
    const mode = options.mode === "black" || options.mode === "face" ? options.mode : "blur";
    const faceAction = options.faceAction === "full" || options.faceAction === "black" ? options.faceAction : "track";
    const faceProfile = options.faceProfile || {};
    const faceProfileSignature = [
      faceProfile.level,
      faceProfile.padding,
      faceProfile.lostTimeoutMs,
      faceProfile.maxOcclusionMs,
      faceProfile.lastUnstableAt,
      faceProfile.lastAdaptedAt,
      faceProfile.movementEvents,
      faceProfile.occlusionEvents,
      faceProfile.lastReason
    ].join(":");
    const isCurrentUser = options.isCurrentUser === true;
    const tracking = mode === "face" && faceAction === "track" && !isCurrentUser;
    const hidden = mode === "face"
      ? (isCurrentUser ? faceAction === "black" : faceAction !== "full")
      : options.hidden === true;
    const visualMode = mode === "face" && faceAction === "black" ? "black" : mode;
    const strength = Math.min(80, Math.max(8, Number(options.blurStrength) || 40));
    const buttonVisibility = options.buttonVisibility === "always" ? "always" : "hover";
    const showTrackingStatus = options.showTrackingStatus === true;
    if (
      record.appliedHidden === hidden &&
      record.appliedMode === mode &&
      record.appliedFaceAction === faceAction &&
      record.appliedFaceProfile === faceProfileSignature &&
      record.appliedStrength === strength &&
      record.appliedButtonVisibility === buttonVisibility &&
      record.appliedTrackingStatus === showTrackingStatus &&
      record.appliedIsCurrentUser === isCurrentUser
    ) return;

    const trackingStatusWasEnabled = record.appliedTrackingStatus === true;
    record.trackingProfile = faceProfile;
    record.trackingStatusEnabled = showTrackingStatus;
    record.isCurrentUser = isCurrentUser;

    record.overlayEl.classList.toggle(CLS.HIDDEN, hidden);
    record.btnEl.classList.toggle(CLS.BTN_ON, hidden);
    record.btnEl.classList.toggle("dvh-btn--always", buttonVisibility === "always");
    record.btnEl.classList.toggle("dvh-btn--face-action", mode === "face");
    record.blackBtnEl.classList.toggle("dvh-btn--face-action", mode === "face");
    record.blackBtnEl.classList.toggle(CLS.BTN_ON, faceAction === "black");
    record.blackBtnEl.classList.toggle("dvh-btn--always", buttonVisibility === "always");
    record.overlayEl.dataset.mode = visualMode;
    record.overlayEl.style.setProperty("--dvh-blur", `${strength}px`);
    record.overlayEl.classList.toggle(CLS.FALLBACK, mode === "blur" && !CSS.supports("backdrop-filter", "blur(1px)"));
    if (DVH.faceZoomController) {
      if (tracking) DVH.faceZoomController.start(record, faceProfile);
      else DVH.faceZoomController.stop(record);
    }
    if (!tracking) {
      record.trackingRuntime = {
        phase: faceAction === "black"
          ? "black"
          : isCurrentUser && mode === "face"
            ? "self"
            : mode === "face" ? "paused" : "inactive"
      };
    }
    updateTrackingStatus(record, null, showTrackingStatus && !trackingStatusWasEnabled);
    if (mode === "face") {
      record.btnEl.setAttribute("aria-pressed", String(tracking));
      record.btnEl.title = isCurrentUser
        ? "Face zoom is disabled for your own video"
        : tracking ? "Show full video for this person" : "Enable face tracking for this person";
      record.btnEl.innerHTML = tracking ? EYE : EYE_OFF;
      record.blackBtnEl.setAttribute("aria-pressed", String(faceAction === "black"));
      record.blackBtnEl.title = faceAction === "black" ? "Remove blackout" : "Blackout entire video";
    } else {
      record.btnEl.setAttribute("aria-pressed", String(hidden));
      record.btnEl.title = hidden ? "Show video" : "Hide video";
      record.btnEl.innerHTML = hidden ? EYE : EYE_OFF;
    }
    record.appliedHidden = hidden;
    record.appliedMode = mode;
    record.appliedFaceAction = faceAction;
    record.appliedFaceProfile = faceProfileSignature;
    record.appliedStrength = strength;
    record.appliedButtonVisibility = buttonVisibility;
    record.appliedTrackingStatus = showTrackingStatus;
    record.appliedIsCurrentUser = isCurrentUser;
  }

  DVH.overlay = { decorate, destroy, applyState, updateTrackingStatus };
})();

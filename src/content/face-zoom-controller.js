(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const DETECTION_INTERVAL_MS = 160;
  const FLOW_INTERVAL_MS = 100;
  const REQUIRED_DETECTIONS = 3;
  const MAX_PIXEL_RATIO = 1.5;
  const MOVEMENT_THRESHOLD = 0.18;
  const OCCLUSION_MISS_THRESHOLD = 5;
  const DEFAULT_PROFILE = {
    level: 0,
    padding: 1.3,
    lostTimeoutMs: 2500,
    maxOcclusionMs: 5000
  };

  function normalizeProfile(profile) {
    const source = profile || {};
    return {
      level: Math.max(0, Math.floor(Number(source.level) || 0)),
      padding: Number.isFinite(source.padding) ? source.padding : DEFAULT_PROFILE.padding,
      lostTimeoutMs: Number.isFinite(source.lostTimeoutMs)
        ? source.lostTimeoutMs
        : DEFAULT_PROFILE.lostTimeoutMs,
      maxOcclusionMs: Number.isFinite(source.maxOcclusionMs)
        ? source.maxOcclusionMs
        : DEFAULT_PROFILE.maxOcclusionMs
    };
  }

  function movementRatio(previous, next) {
    if (!previous || !next) return 0;
    const previousX = previous.x + previous.width / 2;
    const previousY = previous.y + previous.height / 2;
    const nextX = next.x + next.width / 2;
    const nextY = next.y + next.height / 2;
    const scale = Math.max(1, previous.width, previous.height);
    return Math.hypot(nextX - previousX, nextY - previousY) / scale;
  }

  function reportInstability(record, reason) {
    if (DVH.state && typeof DVH.state.noteFaceInstability === "function") {
      DVH.state.noteFaceInstability(record.key, reason, Date.now());
    }
  }

  function reportStability(record) {
    if (DVH.state && typeof DVH.state.noteFaceStability === "function") {
      DVH.state.noteFaceStability(record.key, Date.now());
    }
  }

  function hideCanvas(record) {
    if (!record || !record.canvasEl) return;
    record.canvasEl.hidden = true;
  }

  function resizeCanvas(record) {
    const rect = record.tileEl.getBoundingClientRect();
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (record.canvasEl.width !== width) record.canvasEl.width = width;
    if (record.canvasEl.height !== height) record.canvasEl.height = height;
    return { width, height };
  }

  function clampCrop(crop, video) {
    const width = Math.min(video.videoWidth, Math.max(1, crop.width));
    const height = Math.min(video.videoHeight, Math.max(1, crop.height));
    return {
      x: Math.min(video.videoWidth - width, Math.max(0, crop.x)),
      y: Math.min(video.videoHeight - height, Math.max(0, crop.y)),
      width,
      height
    };
  }

  function clearTracking(record, session) {
    session.state = DVH.faceZoom.createSafetyState();
    session.crop = null;
    session.targetCrop = null;
    session.kalman = null;
    session.lastFaceAt = null;
    session.lastDetectedFace = null;
    session.consecutiveMisses = 0;
    session.occlusionReported = false;
    if (session.motionTracker) session.motionTracker.reset();
    hideCanvas(record);
  }

  function draw(record, session) {
    const showingCrop = session.state.phase === "tracking" || session.state.phase === "holding";
    if (!showingCrop || !session.crop || !session.targetCrop) {
      // The face overlay is transparent, so hiding the canvas reveals Discord's
      // original full video without an extra frame copy.
      hideCanvas(record);
      return;
    }
    const video = record.videoEl;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      hideCanvas(record);
      return;
    }
    try {
      const size = resizeCanvas(record);
      const context = record.canvasEl.getContext("2d", { alpha: false });
      if (!context) {
        hideCanvas(record);
        return;
      }
      session.crop = DVH.faceZoom.smoothCrop(session.crop, session.targetCrop, 0.14);
      const crop = session.crop;
      context.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        size.width,
        size.height
      );
      record.canvasEl.hidden = false;
    } catch (_error) {
      hideCanvas(record);
    }
  }

  function schedule(record, session) {
    if (session.stopped) return;
    const video = record.videoEl;
    if (video && typeof video.requestVideoFrameCallback === "function") {
      session.callbackKind = "video";
      session.callbackId = video.requestVideoFrameCallback((now) => frame(record, session, now));
    } else {
      session.callbackKind = "animation";
      session.callbackId = requestAnimationFrame((now) => frame(record, session, now));
    }
  }

  function handleDetection(record, session, face, now) {
    if (session.stopped) return;
    session.state = DVH.faceZoom.updateSafetyState(session.state, {
      now,
      detected: Boolean(face),
      requiredDetections: REQUIRED_DETECTIONS,
      lostTimeoutMs: session.profile.lostTimeoutMs
    });
    if (face) {
      if (movementRatio(session.lastDetectedFace, face) >= MOVEMENT_THRESHOLD) {
        reportInstability(record, "movement");
      }
      session.lastDetectedFace = { ...face };
      session.consecutiveMisses = 0;
      session.occlusionReported = false;
      reportStability(record);
      const rect = record.tileEl.getBoundingClientRect();
      const nextCrop = DVH.faceZoom.computeCrop(face, {
        sourceWidth: record.videoEl.videoWidth,
        sourceHeight: record.videoEl.videoHeight,
        targetWidth: Math.max(1, rect.width),
        targetHeight: Math.max(1, rect.height),
        padding: session.profile.padding
      });
      const stableCrop = DVH.faceZoom.stabilizeCrop(session.targetCrop, nextCrop);
      session.lastFaceAt = now;
      if (DVH.faceMotion) {
        if (!session.kalman) session.kalman = DVH.faceMotion.createBoxKalman(stableCrop, now);
        session.targetCrop = clampCrop(
          DVH.faceMotion.correctBoxKalman(session.kalman, stableCrop, now),
          record.videoEl
        );
      } else {
        session.targetCrop = stableCrop;
      }
      if (!session.crop) session.crop = { ...session.targetCrop };
    } else {
      session.consecutiveMisses += 1;
      if (!session.occlusionReported && session.consecutiveMisses >= OCCLUSION_MISS_THRESHOLD) {
        session.occlusionReported = true;
        reportInstability(record, "occlusion");
      }
      if (session.state.phase === "full") clearTracking(record, session);
    }
  }

  function trackMotion(record, session, now) {
    if (!session.motionTracker || now - session.lastFlowAt < FLOW_INTERVAL_MS) return;
    session.lastFlowAt = now;
    const reference = session.targetCrop || session.crop;
    const active = session.state.phase === "tracking" || session.state.phase === "holding";
    const occluded = active && session.lastFaceAt !== null && now - session.lastFaceAt >= DETECTION_INTERVAL_MS;
    // Passing no region still refreshes the lightweight grayscale reference,
    // but skips expensive patch matching while BlazeFace is succeeding.
    const flow = session.motionTracker.sample(record.videoEl, occluded ? reference : null);
    if (!active || !session.kalman || session.lastFaceAt === null) return;
    if (now - session.lastFaceAt > session.profile.maxOcclusionMs) {
      clearTracking(record, session);
      return;
    }

    if (occluded && flow) {
      session.targetCrop = clampCrop(
        DVH.faceMotion.translateBoxKalman(session.kalman, flow.dx, flow.dy, now, flow.quality),
        record.videoEl
      );
      session.state = DVH.faceZoom.updateSafetyState(session.state, {
        now,
        tracked: true,
        lostTimeoutMs: session.profile.lostTimeoutMs
      });
    } else if (occluded && session.state.phase === "holding") {
      session.targetCrop = clampCrop(
        DVH.faceMotion.predictBoxKalman(session.kalman, now),
        record.videoEl
      );
    }
  }

  function frame(record, session, now) {
    if (session.stopped) return;
    trackMotion(record, session, now);
    if (!session.pendingDetection && now - session.lastDetectionAt >= DETECTION_INTERVAL_MS) {
      session.lastDetectionAt = now;
      session.pendingDetection = true;
      DVH.faceDetector.detect(record.videoEl, now)
        .then((face) => handleDetection(record, session, face, now))
        .catch(() => handleDetection(record, session, null, now))
        .finally(() => { session.pendingDetection = false; });
    }
    draw(record, session);
    schedule(record, session);
  }

  function start(record, profile) {
    if (!record || !record.videoEl || !record.canvasEl) return;
    if (record.faceZoomSession) {
      record.faceZoomSession.profile = normalizeProfile(profile);
      return;
    }
    hideCanvas(record);
    let motionTracker = null;
    try {
      if (DVH.faceMotion) motionTracker = DVH.faceMotion.createVideoTracker();
    } catch (_error) {
      motionTracker = null;
    }
    const session = {
      stopped: false,
      callbackId: null,
      callbackKind: null,
      pendingDetection: false,
      lastDetectionAt: -Infinity,
      lastFlowAt: -Infinity,
      lastFaceAt: null,
      lastDetectedFace: null,
      consecutiveMisses: 0,
      occlusionReported: false,
      crop: null,
      targetCrop: null,
      kalman: null,
      motionTracker,
      profile: normalizeProfile(profile),
      state: DVH.faceZoom.createSafetyState()
    };
    record.faceZoomSession = session;
    schedule(record, session);
  }

  function stop(record) {
    if (!record) return;
    const session = record.faceZoomSession;
    if (session) {
      session.stopped = true;
      if (session.callbackId !== null) {
        if (session.callbackKind === "video" && record.videoEl && typeof record.videoEl.cancelVideoFrameCallback === "function") {
          record.videoEl.cancelVideoFrameCallback(session.callbackId);
        } else if (session.callbackKind === "animation") {
          cancelAnimationFrame(session.callbackId);
        }
      }
      record.faceZoomSession = null;
      if (session.motionTracker) session.motionTracker.reset();
    }
    hideCanvas(record);
  }

  DVH.faceZoomController = { start, stop, movementRatio };
})();

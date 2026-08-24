(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});

  function finitePositive(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function computeCrop(face, options) {
    const sourceWidth = finitePositive(options && options.sourceWidth, 1);
    const sourceHeight = finitePositive(options && options.sourceHeight, 1);
    const targetWidth = finitePositive(options && options.targetWidth, sourceWidth);
    const targetHeight = finitePositive(options && options.targetHeight, sourceHeight);
    const padding = clamp(finitePositive(options && options.padding, 1.8), 1, 4);
    const targetAspect = targetWidth / targetHeight;

    const faceX = clamp(Number(face && face.x) || 0, 0, sourceWidth);
    const faceY = clamp(Number(face && face.y) || 0, 0, sourceHeight);
    const faceWidth = clamp(finitePositive(face && face.width, 1), 1, sourceWidth - faceX || 1);
    const faceHeight = clamp(finitePositive(face && face.height, 1), 1, sourceHeight - faceY || 1);

    let width = Math.max(faceWidth * padding, faceHeight * padding * targetAspect);
    let height = width / targetAspect;

    if (width > sourceWidth || height > sourceHeight) {
      if (sourceWidth / sourceHeight > targetAspect) {
        height = sourceHeight;
        width = height * targetAspect;
      } else {
        width = sourceWidth;
        height = width / targetAspect;
      }
    }

    const faceRight = faceX + faceWidth;
    const faceBottom = faceY + faceHeight;
    const centerX = faceX + faceWidth / 2;
    // A slight downward bias gives a natural head-and-shoulders crop.
    const centerY = faceY + faceHeight * 0.58;
    let x = centerX - width / 2;
    let y = centerY - height / 2;

    if (width >= faceWidth) x = clamp(x, faceRight - width, faceX);
    if (height >= faceHeight) y = clamp(y, faceBottom - height, faceY);
    x = clamp(x, 0, Math.max(0, sourceWidth - width));
    y = clamp(y, 0, Math.max(0, sourceHeight - height));

    return { x, y, width, height };
  }

  function smoothCrop(previous, next, amount) {
    if (!previous) return { ...next };
    const factor = clamp(Number.isFinite(amount) ? amount : 0.2, 0, 1);
    return {
      x: previous.x + (next.x - previous.x) * factor,
      y: previous.y + (next.y - previous.y) * factor,
      width: previous.width + (next.width - previous.width) * factor,
      height: previous.height + (next.height - previous.height) * factor
    };
  }

  function stabilizeCrop(previous, next) {
    if (!previous) return { ...next };
    const previousCenterX = previous.x + previous.width / 2;
    const previousCenterY = previous.y + previous.height / 2;
    const nextCenterX = next.x + next.width / 2;
    const nextCenterY = next.y + next.height / 2;
    const stableX = Math.abs(nextCenterX - previousCenterX) <= previous.width * 0.025;
    const stableY = Math.abs(nextCenterY - previousCenterY) <= previous.height * 0.025;
    const stableWidth = Math.abs(next.width - previous.width) <= previous.width * 0.04;
    const stableHeight = Math.abs(next.height - previous.height) <= previous.height * 0.04;
    if (stableX && stableY && stableWidth && stableHeight) return { ...previous };

    const width = stableWidth ? previous.width : next.width;
    const height = stableHeight ? previous.height : next.height;
    const centerX = stableX ? previousCenterX : nextCenterX;
    const centerY = stableY ? previousCenterY : nextCenterY;
    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height
    };
  }

  function createSafetyState() {
    return {
      phase: "full",
      consecutiveDetections: 0,
      lastSeenAt: null
    };
  }

  function updateSafetyState(previous, event) {
    const state = previous || createSafetyState();
    const now = Number.isFinite(event && event.now) ? event.now : 0;
    const requiredDetections = Math.max(1, Math.floor(finitePositive(event && event.requiredDetections, 2)));
    const lostTimeoutMs = Math.max(0, finitePositive(event && event.lostTimeoutMs, 900));

    if (event && event.tracked === true && (state.phase === "tracking" || state.phase === "holding")) {
      return {
        phase: "tracking",
        consecutiveDetections: state.consecutiveDetections,
        lastSeenAt: now
      };
    }

    if (event && event.detected === true) {
      const alreadySafe = state.phase === "tracking";
      const consecutiveDetections = alreadySafe
        ? Math.max(requiredDetections, state.consecutiveDetections)
        : state.consecutiveDetections + 1;
      return {
        phase: consecutiveDetections >= requiredDetections ? "tracking" : "full",
        consecutiveDetections,
        lastSeenAt: now
      };
    }
    const mayHold =
      (state.phase === "tracking" || state.phase === "holding") &&
      Number.isFinite(state.lastSeenAt) &&
      now - state.lastSeenAt <= lostTimeoutMs;
    if (mayHold) {
      return {
        phase: "holding",
        consecutiveDetections: state.consecutiveDetections,
        lastSeenAt: state.lastSeenAt
      };
    }
    return createSafetyState();
  }

  DVH.faceZoom = {
    computeCrop,
    smoothCrop,
    stabilizeCrop,
    createSafetyState,
    updateSafetyState
  };
})();

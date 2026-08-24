(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  let detectorPromise = null;
  let lastTimestamp = 0;
  let warned = false;

  function extensionUrl(path) {
    return chrome.runtime.getURL(path);
  }

  function initialize() {
    if (detectorPromise) return detectorPromise;
    detectorPromise = Promise.resolve().then(async () => {
      const visionApi = window.Vision;
      if (!visionApi || !visionApi.FaceDetector) {
        throw new Error("MediaPipe Vision did not load");
      }
      // MediaPipe normally injects its loader through a <script> element. In a
      // Chrome content script that executes in the page's main world, leaving
      // ModuleFactory unavailable here. The manifest preloads the factory in
      // this isolated world, so only the matching WASM binary path is needed.
      const fileset = {
        wasmBinaryPath: extensionUrl("vendor/mediapipe/wasm/vision_wasm_internal.wasm")
      };
      return visionApi.FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: extensionUrl("vendor/mediapipe/models/blaze_face_short_range.tflite")
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.6,
        minSuppressionThreshold: 0.3
      });
    }).catch((error) => {
      if (!warned) {
        warned = true;
        console.warn("[DVH] Face-only detector unavailable; showing the full video.", error);
      }
      throw error;
    });
    return detectorPromise;
  }

  function largestFace(detections) {
    let best = null;
    let bestArea = 0;
    for (const detection of detections || []) {
      const box = detection && detection.boundingBox;
      if (!box) continue;
      const area = Number(box.width) * Number(box.height);
      if (!Number.isFinite(area) || area <= bestArea) continue;
      bestArea = area;
      best = {
        x: Number(box.originX) || 0,
        y: Number(box.originY) || 0,
        width: Number(box.width) || 0,
        height: Number(box.height) || 0
      };
    }
    return best;
  }

  async function detect(video, timestamp) {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const detector = await initialize();
    const requested = Number.isFinite(timestamp) ? timestamp : performance.now();
    lastTimestamp = Math.max(lastTimestamp + 1, requested);
    const result = detector.detectForVideo(video, lastTimestamp);
    return largestFace(result && result.detections);
  }

  DVH.faceDetector = { detect, largestFace };
})();

(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const ANALYSIS_WIDTH = 160;
  const ANALYSIS_HEIGHT = 90;

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function localFlow(previous, current, width, height, centerX, centerY) {
    const radius = 3;
    const searchRadius = 4;
    const x0 = Math.round(centerX);
    const y0 = Math.round(centerY);
    if (
      x0 - radius - searchRadius < 0 ||
      y0 - radius - searchRadius < 0 ||
      x0 + radius + searchRadius >= width ||
      y0 + radius + searchRadius >= height
    ) return null;
    let texture = 0;
    for (let y = y0 - radius; y <= y0 + radius; y += 1) {
      for (let x = x0 - radius; x <= x0 + radius; x += 1) {
        const index = y * width + x;
        texture += Math.abs(previous[index + 1] - previous[index - 1]);
        texture += Math.abs(previous[index + width] - previous[index - width]);
      }
    }
    if (texture < 500) return null;

    let bestError = Infinity;
    let bestX = 0;
    let bestY = 0;
    for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY += 1) {
      for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX += 1) {
        let error = 0;
        for (let y = y0 - radius; y <= y0 + radius; y += 1) {
          for (let x = x0 - radius; x <= x0 + radius; x += 1) {
            error += Math.abs(
              previous[y * width + x] -
              current[(y + offsetY) * width + x + offsetX]
            );
          }
        }
        if (error < bestError) {
          bestError = error;
          bestX = offsetX;
          bestY = offsetY;
        }
      }
    }
    const confidence = Math.max(0, 1 - bestError / (texture * 0.9 + 1));
    if (confidence < 0.2) return null;
    return { dx: bestX, dy: bestY, confidence };
  }

  function estimateOpticalFlow(previous, current, width, height, region) {
    if (!previous || !current || previous.length !== current.length || width < 16 || height < 16 || !region) return null;
    const flows = [];
    const fractions = [0.25, 0.5, 0.75];
    for (const fy of fractions) {
      for (const fx of fractions) {
        const flow = localFlow(
          previous,
          current,
          width,
          height,
          region.x + region.width * fx,
          region.y + region.height * fy
        );
        if (flow) flows.push(flow);
      }
    }
    if (flows.length < 3) return null;
    const dx = median(flows.map((flow) => flow.dx));
    const dy = median(flows.map((flow) => flow.dy));
    const deviations = flows.map((flow) => Math.hypot(flow.dx - dx, flow.dy - dy));
    const spread = median(deviations);
    const coverage = flows.length / 9;
    const confidence = median(flows.map((flow) => flow.confidence));
    const quality = coverage * confidence * Math.max(0, 1 - spread / 3);
    if (quality < 0.25) return null;
    return { dx, dy, quality };
  }

  function createFilter(value, now) {
    return { value, velocity: 0, p00: 100, p01: 0, p10: 0, p11: 2500, lastAt: now };
  }

  function predictFilter(filter, now) {
    const elapsed = Math.max(0, Math.min(0.5, (now - filter.lastAt) / 1000));
    if (elapsed <= 0) return;
    filter.value += filter.velocity * elapsed;
    const p00 = filter.p00;
    const p01 = filter.p01;
    const p10 = filter.p10;
    const p11 = filter.p11;
    const processNoise = 25;
    filter.p00 = p00 + elapsed * (p01 + p10) + elapsed * elapsed * p11 + processNoise;
    filter.p01 = p01 + elapsed * p11;
    filter.p10 = p10 + elapsed * p11;
    filter.p11 = p11 + processNoise * 0.25;
    filter.lastAt = now;
  }

  function correctFilter(filter, measurement, noise) {
    const residual = measurement - filter.value;
    const innovation = filter.p00 + noise;
    const gainPosition = filter.p00 / innovation;
    const gainVelocity = filter.p10 / innovation;
    const p00 = filter.p00;
    const p01 = filter.p01;
    filter.value += gainPosition * residual;
    filter.velocity += gainVelocity * residual;
    filter.p00 -= gainPosition * p00;
    filter.p01 -= gainPosition * p01;
    filter.p10 -= gainVelocity * p00;
    filter.p11 -= gainVelocity * p01;
  }

  function createBoxKalman(crop, now) {
    return {
      centerX: createFilter(crop.x + crop.width / 2, now),
      centerY: createFilter(crop.y + crop.height / 2, now),
      width: createFilter(crop.width, now),
      height: createFilter(crop.height, now)
    };
  }

  function predictBoxKalman(filter, now) {
    for (const item of [filter.centerX, filter.centerY, filter.width, filter.height]) predictFilter(item, now);
    return currentBox(filter);
  }

  function currentBox(filter) {
    const width = Math.max(1, filter.width.value);
    const height = Math.max(1, filter.height.value);
    return {
      x: filter.centerX.value - width / 2,
      y: filter.centerY.value - height / 2,
      width,
      height
    };
  }

  function correctBoxKalman(filter, crop, now, noise) {
    predictBoxKalman(filter, now);
    const measurementNoise = Number.isFinite(noise) ? noise : 20;
    correctFilter(filter.centerX, crop.x + crop.width / 2, measurementNoise);
    correctFilter(filter.centerY, crop.y + crop.height / 2, measurementNoise);
    correctFilter(filter.width, crop.width, measurementNoise * 1.5);
    correctFilter(filter.height, crop.height, measurementNoise * 1.5);
    return currentBox(filter);
  }

  function translateBoxKalman(filter, dx, dy, now, quality) {
    const predicted = predictBoxKalman(filter, now);
    const noise = 35 / Math.max(0.2, quality || 0.2);
    const translated = { ...predicted, x: predicted.x + dx, y: predicted.y + dy };
    return correctBoxKalman(filter, translated, now, noise);
  }

  function grayscale(imageData) {
    const source = imageData.data;
    const output = new Uint8Array(source.length / 4);
    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < source.length; sourceIndex += 4, targetIndex += 1) {
      output[targetIndex] = Math.round(source[sourceIndex] * 0.299 + source[sourceIndex + 1] * 0.587 + source[sourceIndex + 2] * 0.114);
    }
    return output;
  }

  function createVideoTracker() {
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_WIDTH;
    canvas.height = ANALYSIS_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let previous = null;

    function sample(video, crop) {
      if (!context || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
      try {
        context.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
        const current = grayscale(context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT));
        let result = null;
        if (previous && crop) {
          const scaleX = ANALYSIS_WIDTH / video.videoWidth;
          const scaleY = ANALYSIS_HEIGHT / video.videoHeight;
          const region = {
            x: crop.x * scaleX,
            y: crop.y * scaleY,
            width: crop.width * scaleX,
            height: crop.height * scaleY
          };
          const flow = estimateOpticalFlow(previous, current, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, region);
          if (flow) {
            result = {
              dx: flow.dx / scaleX,
              dy: flow.dy / scaleY,
              quality: flow.quality
            };
          }
        }
        previous = current;
        return result;
      } catch (_error) {
        previous = null;
        return null;
      }
    }

    function reset() {
      previous = null;
    }

    return { sample, reset };
  }

  DVH.faceMotion = {
    estimateOpticalFlow,
    createBoxKalman,
    predictBoxKalman,
    correctBoxKalman,
    translateBoxKalman,
    currentBox,
    createVideoTracker
  };
})();

(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const TILE_HINTS = ["videoTile", "tile_", "tile-", "participant", "voiceUser"];
  const CALL_HINTS = ["voiceCall", "callContainer", "call_", "videoTile", "tile_"];
  const EXCLUDE_HINTS = ["streamPreview", "screenshare", "screenShare", "streamTile"];
  const MAX_ASCENT = 8;
  // A tile may be a bit larger than its <video> (nameplate, padding, letterboxing),
  // but never many times larger. Anything past this is a grid/layout container.
  const MAX_AREA_RATIO = 3;
  let lastReport = { totalVideos: 0, accepted: 0, filtered: [] };

  function selectorFor(hints) {
    return hints.map((hint) => `[class*="${hint}"]`).join(",");
  }

  const TILE_SELECTOR = selectorFor(TILE_HINTS);
  const SCOPE_SELECTOR = selectorFor([...TILE_HINTS, ...CALL_HINTS]);
  const EXCLUDE_SELECTOR = selectorFor(EXCLUDE_HINTS);

  function dimensions(video) {
    const rect = video.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function videoCount(node) {
    if (!node || typeof node.querySelectorAll !== "function") return 0;
    return node.querySelectorAll("video").length;
  }

  function areaOf(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return 0;
    const rect = node.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  /**
   * Walk up from a <video> to its participant tile.
   *
   * The defining property of a tile is STRUCTURAL, not a class name:
   *   a tile contains EXACTLY ONE <video>, and is not dramatically larger than it.
   *
   * Class-name hints are only used to pick a nicer container among the ancestors
   * that already satisfy the structural invariant. This is what stops the walk
   * from escaping into the shared video-grid container (which would make one
   * overlay cover — and one toggle hide — every participant at once).
   */
  function resolveTileContainer(video) {
    const videoArea = Math.max(1, areaOf(video));
    let node = video.parentElement;
    let best = node;
    let hinted = null;
    let stoppedBy = "max-ascent";

    for (let depth = 0; node && depth < MAX_ASCENT; depth += 1, node = node.parentElement) {
      if (videoCount(node) > 1) { stoppedBy = "shared-ancestor"; break; }
      if (areaOf(node) > videoArea * MAX_AREA_RATIO) { stoppedBy = "area-blowup"; break; }
      best = node;
      if (!hinted && node.matches && node.matches(TILE_SELECTOR)) hinted = node;
    }

    const tile = hinted || best || video.parentElement || null;
    if (tile) tile.__dvhStoppedBy = stoppedBy;
    return tile;
  }

  function inspect(video) {
    if (video.readyState === 0) return { accepted: false, reason: "not-ready" };
    const size = dimensions(video);
    if (size.width < 40 || size.height < 40) return { accepted: false, reason: "too-small", size };
    if (!video.closest(SCOPE_SELECTOR)) return { accepted: false, reason: "outside-call", size };
    if (video.closest(EXCLUDE_SELECTOR)) return { accepted: false, reason: "screen-share-marker", size };

    const tile = resolveTileContainer(video);
    if (!tile) return { accepted: false, reason: "no-container", size };
    // Hard safety net: never decorate a container that holds more than one video.
    if (videoCount(tile) > 1) return { accepted: false, reason: "container-holds-many-videos", size, tile };

    const identity = DVH.identity.resolveIdentity(tile, video);
    if (!identity) return { accepted: false, reason: "no-camera-identity", size, tile };
    return { accepted: true, reason: "camera", size, tile, identity };
  }

  function scan() {
    const videos = [...document.querySelectorAll("video")];
    const tiles = [];
    const seen = new Set();
    const details = [];

    for (const video of videos) {
      let result;
      try {
        result = inspect(video);
      } catch (error) {
        result = { accepted: false, reason: "inspection-error", error: String(error) };
      }
      details.push({
        video,
        accepted: result.accepted,
        reason: result.reason,
        tile: result.tile || null,
        identity: result.identity || null,
        size: result.size || null,
        error: result.error || null
      });
      if (result.accepted && !seen.has(result.tile)) {
        seen.add(result.tile);
        tiles.push(result.tile);
      }
    }

    lastReport = {
      totalVideos: videos.length,
      accepted: tiles.length,
      filtered: details.filter((item) => !item.accepted).map((item) => item.reason),
      details
    };
    return tiles;
  }

  function findVideoTiles() {
    const tiles = scan();
    if (DVH.state && DVH.state.getSettings().debug) {
      console.debug("[DVH] video tile scan", lastReport);
    }
    return tiles;
  }

  function report() {
    scan();
    return lastReport;
  }

  function describe(node) {
    if (!node || node.nodeType !== 1) return null;
    const rect = node.getBoundingClientRect();
    const data = {};
    for (const attr of node.attributes || []) {
      if (attr.name.startsWith("data-") || attr.name === "id" || attr.name === "aria-label") {
        data[attr.name] = attr.value.slice(0, 80);
      }
    }
    return {
      tag: node.tagName.toLowerCase(),
      class: (typeof node.className === "string" ? node.className : "").slice(0, 160),
      attrs: data,
      videos: videoCount(node),
      rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`
    };
  }

  /**
   * Paste-and-run diagnostic. Returns the ancestor chain of every <video> on the
   * page plus the resolved tile and identity, so a Discord DOM change can be
   * fixed by editing hints in this file and identity.js only.
   */
  function diag() {
    const out = [];
    for (const video of document.querySelectorAll("video")) {
      const chain = [];
      let node = video.parentElement;
      for (let i = 0; node && i < MAX_ASCENT + 2; i += 1, node = node.parentElement) chain.push(describe(node));
      let tile = null;
      let identity = null;
      try {
        tile = resolveTileContainer(video);
        identity = tile ? DVH.identity.resolveIdentity(tile, video) : null;
      } catch (error) {
        identity = { error: String(error) };
      }
      out.push({
        video: describe(video),
        readyState: video.readyState,
        resolvedTile: describe(tile),
        stoppedBy: tile ? tile.__dvhStoppedBy : null,
        identity,
        ancestors: chain
      });
    }
    console.log("[DVH] diagnostic", out);
    return out;
  }

  DVH.tileFinder = {
    TILE_HINTS,
    CALL_HINTS,
    EXCLUDE_HINTS,
    videoCount,
    resolveTileContainer,
    findVideoTiles,
    report,
    diag
  };
})();

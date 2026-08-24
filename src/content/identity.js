(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const SNOWFLAKE = /^\d{17,20}$/;
  const AVATAR_RE = /\/avatars\/(\d{17,20})\//;
  const NAME_HINTS = ["nameTag", "nameplate", "username", "name_", "usernameText"];
  const SELF_PANEL_SELECTOR = [
    '[class*="panels_"]',
    '[class*="panels-"]',
    '[aria-label*="user area" i]'
  ].join(",");
  // Chrome / status strings that live inside a tile and are NOT the username.
  const STOPWORDS = new Set([
    "live", "muted", "deafened", "speaking", "you", "screen", "stream",
    "video", "camera", "hd", "1080p", "720p", "on", "off"
  ]);

  function isPlausibleName(text) {
    if (!text) return false;
    if (text.length < 2 || text.length > 32) return false;
    if (!/\p{L}/u.test(text)) return false;              // must contain a letter
    if (STOPWORDS.has(text.toLocaleLowerCase())) return false;
    return true;
  }

  function leafTexts(tile) {
    const out = [];
    for (const element of tile.querySelectorAll("*")) {
      if (element.children && element.children.length > 0) continue;
      if (element.closest(".dvh-overlay, .dvh-btn, .dvh-tracking-status")) continue;   // never read our own UI
      const text = (element.textContent || "").trim();
      if (!text) continue;
      const cls = typeof element.className === "string" ? element.className : "";
      const hinted = NAME_HINTS.some((hint) => cls.includes(hint));
      out.push({ text, hinted });
    }
    return out;
  }

  /**
   * Pick the username from a tile.
   * Order: class-hinted element in DOM order, then first plausible leaf text.
   * (The old "shortest text wins" rule was wrong -- it happily picked badges
   * like "LIVE" or a participant counter instead of the name.)
   */
  function labelFor(tile, fallback) {
    const texts = leafTexts(tile);
    const hinted = texts.find((item) => item.hinted && isPlausibleName(item.text));
    if (hinted) return hinted.text;
    const plausible = texts.find((item) => isPlausibleName(item.text));
    if (plausible) return plausible.text;
    return fallback || "";
  }

  function ancestorsWithinTile(tile, limit) {
    const nodes = [];
    let parent = tile.parentElement;
    for (let depth = 0; parent && depth < limit; depth += 1, parent = parent.parentElement) {
      // Never read an ancestor that wraps more than one video: its attributes
      // belong to the grid, not to this participant.
      if (DVH.tileFinder && DVH.tileFinder.videoCount(parent) > 1) break;
      nodes.push(parent);
    }
    return nodes;
  }

  const STRATEGIES = [
    function avatar(tile) {
      for (const image of tile.querySelectorAll("img[src]")) {
        const match = image.getAttribute("src").match(AVATAR_RE);
        if (match) {
          return { key: `id:${match[1]}`, strength: "strong", label: labelFor(tile, match[1]), strategy: "avatar" };
        }
      }
      return null;
    },
    function userAttribute(tile) {
      const nodes = [tile, ...tile.querySelectorAll('[data-user-id], [id^="user-"]'), ...ancestorsWithinTile(tile, 4)];
      for (const node of nodes) {
        if (!node || typeof node.getAttribute !== "function") continue;
        const dataId = node.getAttribute("data-user-id");
        const idValue = node.getAttribute("id");
        const id = dataId || (idValue && idValue.startsWith("user-") ? idValue.slice(5) : "");
        if (SNOWFLAKE.test(id)) {
          return { key: `id:${id}`, strength: "strong", label: labelFor(tile, id), strategy: "attribute" };
        }
      }
      return null;
    },
    function ariaLabel(tile) {
      const nodes = [tile, ...tile.querySelectorAll("[aria-label]")];
      for (const node of nodes) {
        const raw = node.getAttribute && node.getAttribute("aria-label");
        if (!raw) continue;
        const text = raw.trim();
        if (!isPlausibleName(text)) continue;
        return {
          key: `name:${text.toLocaleLowerCase()}`,
          strength: "weak",
          label: text,
          strategy: "aria-label"
        };
      }
      return null;
    },
    function nameplate(tile) {
      const label = labelFor(tile, "");
      if (!isPlausibleName(label)) return null;
      return { key: `name:${label.toLocaleLowerCase()}`, strength: "weak", label, strategy: "nameplate" };
    }
  ];

  function resolveIdentity(tile) {
    if (!tile || typeof tile.querySelectorAll !== "function") return null;
    for (const strategy of STRATEGIES) {
      const result = strategy(tile);
      if (result) return result;
    }
    return null;
  }

  function normalizedLabel(value) {
    return String(value || "")
      .replace(/\s*(?:[,·-]\s*)?(?:[([{]\s*)?(?:you|أنت)(?:\s*[)\]}])?\s*$/i, "")
      .trim()
      .toLocaleLowerCase();
  }

  function resolveCurrentUser() {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return null;
    const candidates = [...document.querySelectorAll(SELF_PANEL_SELECTOR)];

    for (const candidate of candidates) {
      for (const image of candidate.querySelectorAll("img[src]")) {
        const source = image.getAttribute("src") || "";
        const match = source.match(AVATAR_RE);
        if (!match) continue;
        const label = labelFor(candidate, image.getAttribute("alt") || match[1]);
        return {
          key: `id:${match[1]}`,
          label,
          normalizedLabel: normalizedLabel(label),
          strength: "strong"
        };
      }
    }

    for (const candidate of candidates) {
      const label = labelFor(candidate, "");
      if (!isPlausibleName(label)) continue;
      return {
        key: `name:${normalizedLabel(label)}`,
        label,
        normalizedLabel: normalizedLabel(label),
        strength: "weak"
      };
    }
    return null;
  }

  function isCurrentUser(identity, currentUser) {
    if (!identity || !currentUser) return false;
    if (identity.key && currentUser.key && identity.key === currentUser.key) return true;
    const identityLabel = normalizedLabel(identity.label);
    const currentLabel = currentUser.normalizedLabel || normalizedLabel(currentUser.label);
    return Boolean(identityLabel && currentLabel && identityLabel === currentLabel);
  }

  function tileRepresentsCurrentUser(tile) {
    if (!tile || typeof tile.querySelectorAll !== "function") return false;
    const nodes = [tile, ...tile.querySelectorAll("*")];
    return nodes.some((node) => {
      if (node.children && node.children.length > 0) return false;
      const text = String(node.textContent || "").trim();
      return /^\(?(?:you|أنت)\)?$/i.test(text) || /(?:\(you\)|\(أنت\))$/i.test(text);
    });
  }

  DVH.identity = {
    STRATEGIES,
    resolveIdentity,
    resolveCurrentUser,
    isCurrentUser,
    tileRepresentsCurrentUser,
    isPlausibleName,
    labelFor,
    normalizedLabel
  };
})();

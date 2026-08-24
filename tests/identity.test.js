"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor({ text = "", attrs = {}, children = [] } = {}) {
    this.textContent = text;
    this.attrs = attrs;
    this.children = children;
    this.parentElement = null;
    for (const child of children) child.parentElement = this;
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  closest() {
    return null;
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelectorAll(selector) {
    const all = this.descendants();
    if (selector === "*") return all;
    if (selector === "img[src]") return all.filter((item) => item.attrs.tag === "img" && item.attrs.src);
    if (selector.includes("data-user-id")) {
      return all.filter((item) => item.attrs["data-user-id"] || (item.attrs.id || "").startsWith("user-"));
    }
    return [];
  }
}

function loadIdentity() {
  const window = { __DVH__: {} };
  const context = vm.createContext({ window });
  const source = fs.readFileSync(path.join(__dirname, "../src/content/identity.js"), "utf8");
  vm.runInContext(source, context);
  return window.__DVH__.identity;
}

test("avatar URL yields a strong snowflake identity", () => {
  const api = loadIdentity();
  const tile = new Element({ children: [
    new Element({ attrs: { tag: "img", src: "https://cdn.discordapp.com/avatars/123456789012345678/hash.webp" } }),
    new Element({ text: "Ahmed" })
  ] });
  assert.deepEqual({ ...api.resolveIdentity(tile) }, {
    key: "id:123456789012345678",
    strength: "strong",
    label: "Ahmed",
    strategy: "avatar"
  });
});

test("default avatar falls back to a weak name identity", () => {
  const api = loadIdentity();
  const tile = new Element({ children: [
    new Element({ attrs: { tag: "img", src: "https://cdn.discordapp.com/embed/avatars/2.png" } }),
    new Element({ text: "Mona" })
  ] });
  assert.deepEqual({ ...api.resolveIdentity(tile) }, {
    key: "name:mona",
    strength: "weak",
    label: "Mona",
    strategy: "nameplate"
  });
});

test("empty tile has no identity", () => {
  assert.equal(loadIdentity().resolveIdentity(new Element()), null);
});

test("current user matches by Discord id and falls back to normalized username", () => {
  const api = loadIdentity();
  assert.equal(api.isCurrentUser(
    { key: "id:123456789012345678", label: "Different display name" },
    { key: "id:123456789012345678", label: "Ahmed" }
  ), true);
  assert.equal(api.isCurrentUser(
    { key: "name:ahmed", label: "Ahmed (You)" },
    { key: "id:123456789012345678", label: "Ahmed", normalizedLabel: "ahmed" }
  ), true);
  assert.equal(api.isCurrentUser(
    { key: "id:999999999999999999", label: "Mona" },
    { key: "id:123456789012345678", label: "Ahmed", normalizedLabel: "ahmed" }
  ), false);
});

test("a tile explicitly labeled You is recognized as the current user", () => {
  const api = loadIdentity();
  const tile = new Element({ children: [
    new Element({ text: "Ahmed" }),
    new Element({ text: "(You)" })
  ] });
  assert.equal(api.tileRepresentsCurrentUser(tile), true);
});

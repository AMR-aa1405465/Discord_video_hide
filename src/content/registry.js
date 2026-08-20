(function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  const records = new WeakMap();

  DVH.registry = {
    get: (tile) => records.get(tile),
    set: (tile, record) => records.set(tile, record),
    delete: (tile) => records.delete(tile)
  };
})();

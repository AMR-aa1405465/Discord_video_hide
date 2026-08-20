(async function () {
  "use strict";

  const DVH = (window.__DVH__ = window.__DVH__ || {});
  await DVH.state.init();
  DVH.reconciler.start();

  function syncDebugApi() {
    if (DVH.state.getSettings().debug === true) {
      DVH.debug = {
        reconcile: DVH.reconciler.reconcile,
        findVideoTiles: DVH.tileFinder.findVideoTiles,
        report: DVH.tileFinder.report,
        state: DVH.state.state
      };
    } else {
      delete DVH.debug;
    }
  }

  syncDebugApi();
  DVH.state.onChange(syncDebugApi);
})();

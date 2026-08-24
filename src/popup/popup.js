(function () {
  "use strict";

  const DVH = window.__DVH__;
  const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
  const visibilityInputs = [...document.querySelectorAll('input[name="buttonVisibility"]')];
  const blurSection = document.getElementById("blur-section");
  const blurInput = document.getElementById("blur-strength");
  const blurValue = document.getElementById("blur-value");
  const blurPreview = document.getElementById("blur-preview");
  const debugInput = document.getElementById("debug");
  const showTrackingStatusInput = document.getElementById("show-tracking-status");
  const hiddenList = document.getElementById("hidden-list");
  const emptyState = document.getElementById("empty-state");
  const showAll = document.getElementById("show-all");
  const status = document.getElementById("status");
  let currentHidden = [];

  function announce(message) {
    status.textContent = message;
    setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 1200);
  }

  function updateBlurUi(mode, strength) {
    const disabled = mode !== "blur";
    blurInput.disabled = disabled;
    blurSection.classList.toggle("dvh-is-disabled", disabled);
    blurValue.value = `${strength} px`;
    blurValue.textContent = `${strength} px`;
    blurPreview.style.setProperty("--preview-blur", `${Math.max(2, strength / 4)}px`);
  }

  function renderHidden() {
    hiddenList.replaceChildren();
    emptyState.hidden = currentHidden.length > 0;
    showAll.disabled = currentHidden.length === 0;
    for (const item of currentHidden) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = `${item.strength === "weak" ? "⚠ " : ""}${item.label}`;
      if (item.strength === "weak") name.title = "Name-based match — it stops working if this person changes their name.";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "dvh-remove-button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Show ${item.label}`);
      remove.addEventListener("click", async () => {
        currentHidden = currentHidden.filter((entry) => entry.key !== item.key);
        renderHidden();
        await DVH.storage.saveHidden(currentHidden);
        announce("Participant shown");
      });
      row.append(name, remove);
      hiddenList.append(row);
    }
  }

  async function render() {
    const data = await DVH.storage.load();
    currentHidden = data.hidden;
    for (const input of modeInputs) input.checked = input.value === data.settings.mode;
    for (const input of visibilityInputs) input.checked = input.value === data.settings.buttonVisibility;
    blurInput.value = String(data.settings.blurStrength);
    debugInput.checked = data.settings.debug;
    showTrackingStatusInput.checked = data.settings.showTrackingStatus;
    updateBlurUi(data.settings.mode, data.settings.blurStrength);
    renderHidden();
  }

  for (const input of modeInputs) {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      updateBlurUi(input.value, Number(blurInput.value));
      await DVH.storage.saveSettings({ mode: input.value });
      announce("Mode updated");
    });
  }

  blurInput.addEventListener("input", () => {
    updateBlurUi("blur", Number(blurInput.value));
    DVH.storage.saveSettings({ blurStrength: Number(blurInput.value) }).catch(() => {});
  });

  for (const input of visibilityInputs) {
    input.addEventListener("change", () => {
      if (input.checked) DVH.storage.saveSettings({ buttonVisibility: input.value }).catch(() => {});
    });
  }

  debugInput.addEventListener("change", () => {
    DVH.storage.saveSettings({ debug: debugInput.checked }).catch(() => {});
  });

  showTrackingStatusInput.addEventListener("change", () => {
    DVH.storage.saveSettings({ showTrackingStatus: showTrackingStatusInput.checked })
      .then(() => announce(showTrackingStatusInput.checked ? "Tracking updates shown" : "Tracking updates hidden"))
      .catch(() => announce("Could not update setting"));
  });

  showAll.addEventListener("click", async () => {
    currentHidden = [];
    renderHidden();
    await DVH.storage.saveHidden([]);
    announce("Everyone shown");
  });

  DVH.storage.subscribe(() => render().catch(() => {}));
  render().catch(() => announce("Could not load settings"));
})();

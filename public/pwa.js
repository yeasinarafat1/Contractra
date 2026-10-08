(() => {
  const installButton = document.querySelector("#install-app-button");
  const installHelpDialog = document.querySelector("#install-help-dialog");
  const closeInstallHelp = document.querySelector("#close-install-help");
  const doneInstallHelp = document.querySelector("#done-install-help");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches
    || navigator.standalone === true;

  let pendingInstallPrompt = null;

  if (isIOS && !isStandalone) {
    installButton.hidden = false;
    installButton.querySelector("span").textContent = "Add app";
    installButton.setAttribute("aria-label", "How to add Contact Manager to your Home Screen");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingInstallPrompt = event;
    installButton.hidden = false;
    installButton.querySelector("span").textContent = "Install now";
    installButton.setAttribute("aria-label", "Install Contact Manager");
  });

  window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = null;
    installButton.hidden = true;
  });

  installButton.addEventListener("click", async () => {
    if (!pendingInstallPrompt) {
      if (isIOS && !isStandalone) installHelpDialog.showModal();
      return;
    }

    const installPrompt = pendingInstallPrompt;
    pendingInstallPrompt = null;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installButton.hidden = true;
  });

  function closeInstallInstructions() {
    installHelpDialog.close();
  }

  closeInstallHelp.addEventListener("click", closeInstallInstructions);
  doneInstallHelp.addEventListener("click", closeInstallInstructions);
  installHelpDialog.addEventListener("click", (event) => {
    if (event.target === installHelpDialog) closeInstallInstructions();
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {
      // The page stays usable if service worker registration is unavailable.
    });
  }
})();

(() => {
  const STORAGE_KEY = "contact-manager.theme.v1";
  const root = document.documentElement;
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === "dark" ? "#111a26" : "#f3f6f9";
  }

  function updateToggle(button, theme) {
    const isDark = theme === "dark";
    const label = isDark ? "Light mode" : "Dark mode";
    const action = `Switch to ${isDark ? "light" : "dark"} mode`;
    const iconUse = button.querySelector("use");

    if (iconUse) iconUse.setAttribute("href", `#icon-${isDark ? "sun" : "moon"}`);
    button.querySelector("#theme-toggle-label").textContent = label;
    button.setAttribute("aria-label", action);
    button.setAttribute("aria-pressed", String(isDark));
    button.title = action;
  }

  const savedTheme = getSavedTheme();
  const initialTheme = savedTheme ?? (systemTheme?.matches ? "dark" : "light");
  applyTheme(initialTheme);

  function initializeToggle() {
    const button = document.querySelector("#theme-toggle");
    if (!button) return;

    updateToggle(button, initialTheme);
    button.addEventListener("click", () => {
      const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      updateToggle(button, nextTheme);

      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch {
        // The selected theme remains active for this page when storage is unavailable.
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeToggle, { once: true });
  } else {
    initializeToggle();
  }
})();

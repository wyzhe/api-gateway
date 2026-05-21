// Runs before first paint. Sets the .dark class on <html> from the stored
// theme preference, falling back to the OS color-scheme. Keep this logic in
// sync with resolveTheme() in src/lib/theme.tsx.
(function () {
  try {
    var pref = localStorage.getItem("theme"); // "system" | "light" | "dark" | null
    // Normalize unknown/garbage values to system, matching readStoredPreference().
    if (pref !== "dark" && pref !== "light" && pref !== "system") pref = null;
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = pref === "dark" || ((pref === "system" || !pref) && systemDark);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    /* localStorage / matchMedia unavailable — keep the class as authored in index.html */
  }
})();

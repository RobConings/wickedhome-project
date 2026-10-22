/**
 * Registers the service worker (public/sw.js) that makes WickedHome installable as a home screen app.
 * Browsers only allow it over HTTPS (or localhost): it runs on https://home.example.be, also while that
 * serves the dev server, and silently does nothing on http://192.168.1.10. Hot reload is unaffected: the
 * worker only handles page loads (network first) and hashed /assets files, which dev doesn't use.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

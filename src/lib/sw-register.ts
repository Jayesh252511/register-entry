/** Single registrar for the offline app worker. Never runs in dev, preview, or iframes. */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const h = window.location.hostname;
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  const refused =
    !import.meta.env.PROD || inIframe ||
    h.startsWith("id-preview--") || h.startsWith("preview--") ||
    h === "lovableproject.com" || h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev") ||
    new URLSearchParams(window.location.search).has("sw") && new URLSearchParams(window.location.search).get("sw") === "off";
  if (refused) {
    navigator.serviceWorker.getRegistrations().then((regs) =>
      regs.forEach((r) => { if (r.active?.scriptURL.endsWith("/sw.js")) void r.unregister(); }));
    return;
  }
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => {
    // Warm the page cache so the app opens offline from any main screen.
    for (const p of ["/", "/new", "/register", "/search", "/reports", "/settings"]) {
      fetch(p, { headers: { "x-warm": "1", accept: "text/html" }, credentials: "include" }).catch(() => {});
    }
  }).catch(() => {});
}

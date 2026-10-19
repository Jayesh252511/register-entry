// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        manifest: false,
        devOptions: { enabled: false },
        filename: "sw.js",
        outDir: "dist/client",
        workbox: {
          globDirectory: "dist/client",
          globPatterns: ["**/*.{js,css,png,ico,svg,woff2,webmanifest}"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                url.origin === self.location.origin &&
                !url.pathname.startsWith("/~oauth") &&
                !url.pathname.startsWith("/_serverFn") &&
                (request.mode === "navigate" || request.headers.get("x-warm") === "1"),
              handler: "NetworkFirst",
              options: {
                cacheName: "pages",
                networkTimeoutSeconds: 4,
                plugins: [
                  {
                    handlerDidError: async () => (await caches.match("/", { cacheName: "pages" })) ?? Response.error(),
                  },
                ],
              },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "fonts" },
            },
          ],
        },
      }),
    ],
  },
});

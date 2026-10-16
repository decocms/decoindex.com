import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { decoVitePlugin } from "@decocms/tanstack/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

// Trimmed from deco-sites/demo-storefront: same plugin order, minus commerce/otel.
export default defineConfig({
  server: {
    allowedHosts: [".decocdn.com", ".trycloudflare.com", ".preview-studio.decocms.com", ".decocms.com"],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({ server: { entry: "server" } }),
    react({ babel: { plugins: [["babel-plugin-react-compiler", { target: "19" }]] } }),
    tailwindcss(),
    decoVitePlugin(),
    {
      // meta.gen.json is admin-only schema; keep it out of the client bundle.
      name: "deco-stub-meta-gen",
      enforce: "pre" as const,
      resolveId(id, importer, options) {
        if (!options?.ssr && importer && id.includes("meta.gen")) return "\0stub:meta-gen";
      },
      load(id) {
        if (id === "\0stub:meta-gen") return "export default {};";
      },
    },
  ],
  define: { "process.env.DECO_SITE_NAME": JSON.stringify("decoshop") },
  resolve: {
    dedupe: [
      "@tanstack/react-start",
      "@tanstack/react-router",
      "@tanstack/react-start-server",
      "@tanstack/start-server-core",
      "@tanstack/start-client-core",
      "@tanstack/start-plugin-core",
      "@tanstack/start-storage-context",
      "react",
      "react-dom",
    ],
    alias: { "~": path.resolve(__dirname, "src") },
  },
});

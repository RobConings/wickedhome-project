import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The public hostname comes from PUBLIC_URL in .env (loaded by the server with --env-file).
const publicHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : undefined;

// Used by the dev server (Vite runs as middleware inside Express, see src/api/server.ts),
// by `vite build` and by Storybook.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // The dev server is also published on PUBLIC_URL through nginx; Vite blocks unknown hosts.
    allowedHosts: publicHost ? [publicHost] : [],
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});

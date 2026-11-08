import "./build-walkthrough.mjs";
import { createServer, build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const base = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(base, "../../..");
const config = {
  configFile: false,
  root: path.join(base, "preview"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.join(root, "src") } },
  publicDir: false,
  build: {
    outDir: path.join(base, "site"),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        atlas: path.join(base, "preview/index.html"),
        walkthrough: path.join(base, "preview/walkthrough.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 55450,
    strictPort: true,
    fs: { allow: [root] },
  },
};
if (process.argv.includes("--build")) {
  await build(config);
  process.exit(0);
}
const server = await createServer(config);
await server.listen();
console.log(
  "Design atlas: http://127.0.0.1:55450/?screen=project-detail&lang=en",
);

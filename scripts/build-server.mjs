// Bundles src/api into dist/server.js. npm packages stay external (they are installed on the server);
// only our own source, including the feature `types/` contracts and the assistant in ai/ (the `@ai/*`
// alias from tsconfig.json), is bundled. The skills' guide.md files are read at startup from ai/skills in
// the deployed checkout (ai/core/skills.ts finds the folder from dist/), so they are not copied.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/api/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)],
  logLevel: "info",
});

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(root, "preview");
const frames = JSON.parse(
  await readFile(path.join(base, "walkthrough-data.json"), "utf8"),
);
const escape = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const journeys = [...new Set(frames.map((f) => f.journey))];
const journeyButtons = journeys
  .map(
    (name) =>
      `<button type="button" data-journey="${escape(name)}">${escape(name)}</button>`,
  )
  .join("");
const screens = frames
  .map(
    (f) => `<article class="screen" id="${escape(f.id)}" hidden>
<figure class="frame ${f.format}"><img src="./wireframes/${escape(f.image)}" alt="${escape(f.title)} — proposed ${f.format} wireframe" tabindex="0" loading="lazy"><figcaption>${escape(f.step)} · actual shared React components · click to enlarge</figcaption></figure>
<aside class="notes"><div class="eyebrow">${escape(f.journey)}</div><h2>${escape(f.title)}</h2><p class="intro">${escape(f.intro)}</p><ol class="changes">${f.changes.map((text) => `<li>${escape(text)}</li>`).join("")}</ol><div class="next"><strong>What happens next</strong>${escape(f.next)}</div><p class="connections">${escape(f.connection)}</p><a class="interactive" href="./index.html?screen=${escape(f.screen)}&amp;lang=en">Try this screen in the atlas ↗</a></aside></article>`,
  )
  .join("\n");
const template = await readFile(
  path.join(base, "walkthrough.template.html"),
  "utf8",
);
await writeFile(
  path.join(base, "walkthrough.html"),
  template
    .replace("__SCREENS__", screens)
    .replace("__JOURNEYS__", journeyButtons)
    .replace("__DATA__", JSON.stringify(frames).replaceAll("<", "\\u003c")),
);
console.log(
  `Built walkthrough: ${frames.length} annotated screens across ${journeys.length} chapters`,
);

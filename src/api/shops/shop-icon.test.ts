/**
 * Unit tests for shop icon discovery: HTML/manifest parsing, ranking and image sniffing. No network or
 * database needed. Run on the server:
 *
 *   npx tsx --test src/api/shops/shop-icon.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attemptOrder,
  iconFormat,
  parseAttributes,
  parseIconCandidates,
  parseManifestIcons,
  parseSizes,
  rankCandidates,
  sniffImageType,
  type IconCandidate,
} from "./shop-icon";

const page = (url: string) => new URL(url);
const urls = (candidates: IconCandidate[]) => candidates.map((candidate) => candidate.url);
const favicon = (origin: string): IconCandidate => ({ url: `${origin}/favicon.ico`, source: "favicon", size: null, square: true, format: "ico" });

describe("parseAttributes", () => {
  it("reads quoted, single-quoted and unquoted values and decodes entities", () => {
    const attributes = parseAttributes(`<link REL='shortcut icon' href="/img/fav.png?v=1&amp;x=2" sizes=32x32 data-flag>`);
    assert.equal(attributes.get("rel"), "shortcut icon");
    assert.equal(attributes.get("href"), "/img/fav.png?v=1&x=2");
    assert.equal(attributes.get("sizes"), "32x32");
    assert.equal(attributes.get("data-flag"), "");
  });
});

describe("parseSizes / iconFormat", () => {
  it("picks the largest square size", () => {
    assert.deepEqual(parseSizes("16x16 32x32 180x180"), { size: 180, square: true });
    assert.deepEqual(parseSizes("any"), { size: Infinity, square: true });
    assert.deepEqual(parseSizes("300x100"), { size: 100, square: false });
    assert.deepEqual(parseSizes(undefined), { size: null, square: true });
  });
  it("detects formats from type or extension", () => {
    assert.equal(iconFormat("image/svg+xml", "https://x.be/a"), "svg");
    assert.equal(iconFormat("image/vnd.microsoft.icon", "https://x.be/a"), "ico");
    assert.equal(iconFormat(undefined, "https://x.be/icons/apple.PNG?v=3"), "png");
    assert.equal(iconFormat(undefined, "https://x.be/logo.jpg"), "jpeg");
    assert.equal(iconFormat(undefined, "https://x.be/icon"), "unknown");
  });
});

describe("parseIconCandidates", () => {
  it("collects icon links, the manifest and og:image from a supermarket-style head", () => {
    const html = `<!doctype html><html lang="nl"><head>
      <meta charset="utf-8">
      <title>Colruyt Laagste Prijzen</title>
      <meta property="og:image" content="https://www.colruyt.be/content/dam/banner-1200x630.jpg">
      <link rel="icon" type="image/png" sizes="32x32" href="/etc/designs/colruyt/favicon-32x32.png">
      <link rel="icon" type="image/png" sizes="16x16" href="/etc/designs/colruyt/favicon-16x16.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/etc/designs/colruyt/apple-touch-icon.png">
      <link rel="mask-icon" href="/etc/designs/colruyt/safari-pinned-tab.svg" color="#e30613">
      <link rel="manifest" href="/site.webmanifest">
      <link rel="stylesheet" href="/main.css">
    </head><body></body></html>`;
    const result = parseIconCandidates(html, page("https://www.colruyt.be/nl"));
    assert.deepEqual(urls(result.icons), [
      "https://www.colruyt.be/etc/designs/colruyt/favicon-32x32.png",
      "https://www.colruyt.be/etc/designs/colruyt/favicon-16x16.png",
      "https://www.colruyt.be/etc/designs/colruyt/apple-touch-icon.png",
    ]);
    assert.equal(result.manifestUrl, "https://www.colruyt.be/site.webmanifest");
    assert.equal(result.ogImageUrl, "https://www.colruyt.be/content/dam/banner-1200x630.jpg");
    assert.equal(rankCandidates(result.icons)[0]?.url, "https://www.colruyt.be/etc/designs/colruyt/apple-touch-icon.png");
  });

  it("resolves relative URLs against the final page URL and <base href>", () => {
    const html = `<head><link rel="icon" href="static/favicon.svg" type="image/svg+xml">
      <link rel="apple-touch-icon" href="//cdn.example.com/touch.png"></head>`;
    const result = parseIconCandidates(html, page("https://www.ikea.com/be/nl/"));
    assert.deepEqual(urls(result.icons), [
      "https://www.ikea.com/be/nl/static/favicon.svg",
      "https://cdn.example.com/touch.png",
    ]);
    const withBase = parseIconCandidates(`<base href="/assets/"><link rel=icon href=fav.ico>`, page("https://shop.be/a/b"));
    assert.deepEqual(urls(withBase.icons), ["https://shop.be/assets/fav.ico"]);
  });

  it("ignores commented-out links, scripts, dark-mode-only icons and non-http URLs", () => {
    const html = `<!-- <link rel="icon" href="/old.ico"> -->
      <script>document.write('<link rel="icon" href="/js.png">')</script>
      <link rel="icon" href="/dark.svg" media="(prefers-color-scheme: dark)">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="icon" href="javascript:alert(1)">
      <link rel="icon" href="/light.svg" media="(prefers-color-scheme: light)">`;
    assert.deepEqual(urls(parseIconCandidates(html, page("https://www.bol.com/be/nl/")).icons), ["https://www.bol.com/light.svg"]);
  });

  it("finds nothing on a page without icons", () => {
    const result = parseIconCandidates("<html><head><title>x</title></head></html>", page("https://x.be"));
    assert.deepEqual(result, { icons: [], manifestUrl: null, ogImageUrl: null });
  });
});

describe("parseManifestIcons", () => {
  it("reads icons relative to the manifest URL and flags maskable-only ones", () => {
    const manifest = {
      name: "Coolblue",
      icons: [
        { src: "icons/icon-72.png", sizes: "72x72", type: "image/png" },
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "icons/mono.svg", sizes: "any", purpose: "monochrome" },
        { sizes: "48x48" },
      ],
    };
    const icons = parseManifestIcons(manifest, page("https://www.coolblue.be/static/manifest.json"));
    assert.deepEqual(urls(icons), [
      "https://www.coolblue.be/static/icons/icon-72.png",
      "https://www.coolblue.be/static/icons/icon-192.png",
      "https://www.coolblue.be/static/icons/icon-512-maskable.png",
    ]);
    assert.equal(icons[2]?.maskable, true);
    assert.equal(rankCandidates(icons)[0]?.url, "https://www.coolblue.be/static/icons/icon-192.png");
  });

  it("tolerates junk", () => {
    assert.deepEqual(parseManifestIcons(null, page("https://x.be/m.json")), []);
    assert.deepEqual(parseManifestIcons({ icons: "nope" }, page("https://x.be/m.json")), []);
  });
});

describe("ranking", () => {
  const icon = (partial: Partial<IconCandidate> & { url: string }): IconCandidate => ({
    source: "icon",
    size: null,
    square: true,
    format: "png",
    ...partial,
  });

  it("prefers a square raster ≥ 64 px, then SVG, then small rasters", () => {
    const ranked = rankCandidates([
      icon({ url: "16", size: 16 }),
      icon({ url: "svg", format: "svg", size: Infinity }),
      icon({ url: "32", size: 32 }),
      icon({ url: "512", size: 512 }),
      icon({ url: "touch", source: "apple-touch-icon", size: null }),
      icon({ url: "banner", size: 100, square: false }),
    ]);
    assert.deepEqual(urls(ranked), ["touch", "512", "svg", "32", "16", "banner"]);
  });

  it("puts favicon.ico and og:image last when better icons exist", () => {
    const order = attemptOrder(
      [icon({ url: "https://x.be/a.png", size: 192 }), icon({ url: "https://x.be/b.svg", format: "svg" })],
      [favicon("https://x.be")],
      "https://x.be/og.jpg",
    );
    assert.deepEqual(urls(order), ["https://x.be/a.png", "https://x.be/b.svg", "https://x.be/favicon.ico", "https://x.be/og.jpg"]);
  });

  it("caps attempts but always tries favicon.ico", () => {
    const many = [64, 96, 128, 180, 192, 256].map((size) => icon({ url: `https://x.be/${size}.png`, size }));
    const order = attemptOrder(many, [favicon("https://x.be")], null);
    assert.equal(order.length, 5);
    assert.equal(order[0]?.url, "https://x.be/192.png");
    assert.equal(order.at(-1)?.url, "https://x.be/favicon.ico");
  });
});

describe("sniffImageType", () => {
  it("recognises real images by their magic bytes", () => {
    assert.equal(sniffImageType(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")), "image/png");
    assert.equal(sniffImageType(Buffer.from("ffd8ffe000104a464946", "hex")), "image/jpeg");
    assert.equal(sniffImageType(Buffer.from("GIF89a\x01\x00\x01\x00", "latin1")), "image/gif");
    assert.equal(sniffImageType(Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "latin1")), "image/webp");
    assert.equal(sniffImageType(Buffer.concat([Buffer.from("000001000100", "hex"), Buffer.alloc(16)])), "image/x-icon");
    assert.equal(
      sniffImageType(Buffer.from('\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')),
      "image/svg+xml",
    );
  });

  it("rejects HTML error pages and other text", () => {
    assert.equal(sniffImageType(Buffer.from("<!doctype html><html><body>Not found</body></html>")), null);
    assert.equal(sniffImageType(Buffer.from("{\"error\":true}")), null);
    assert.equal(sniffImageType(Buffer.alloc(0)), null);
  });
});

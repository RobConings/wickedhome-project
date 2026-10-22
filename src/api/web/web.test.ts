/**
 * The web service: the SSRF guard (schemes, ports, credentials, local names, private/loopback/link-local/
 * CGNAT/multicast/metadata/IPv4-mapped addresses, DNS answers, redirects, timeouts), the pinned-address
 * transport, body limits, page extraction (JSON-LD, microdata, OpenGraph, main text) and the SearXNG search.
 * Never touches the internet: pages and DNS are faked, the transport test uses a local server.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/web/web.test.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { after, describe, it } from "node:test";
import { FAKE_PAGES, fakePageTransport, installFakeWeb } from "./web-fake";
import { extractPage, parsePrice, servingsFromYield, trimText } from "./web-extract";
import { checkPageUrl, guardedGet, internetTransport, WebFetchError, type PageTransport } from "./web-fetch";
import { readPage, readWebSettings, searchWeb, siteDomain, WebPageError, WebSearchError } from "./web.service";

const refusedWith = (code: string) => (error: unknown) => error instanceof WebFetchError && error.code === code;

describe("checkPageUrl", () => {
  it("refuses other schemes, credentials and non-standard ports", () => {
    for (const url of ["ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "gopher://example.com/", "not a url"]) {
      assert.throws(() => checkPageUrl(url), refusedWith("unsafe_url"), url);
    }
    for (const url of ["https://user:pass@example.com/", "https://user@example.com/", "http://example.com:8080/", "http://example.com:22/", "https://example.com:5432/", "http://example.com:8123/"]) {
      assert.throws(() => checkPageUrl(url), refusedWith("unsafe_url"), url);
    }
  });

  it("refuses local names and private, loopback, link-local, CGNAT, multicast, metadata and mapped literal IPs", () => {
    for (const url of [
      "http://localhost/",
      "http://app.localhost/",
      "http://nas.local/",
      "http://router.lan/",
      "http://router/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://printer.home.arpa/",
      "http://127.0.0.1/",
      "http://127.1.2.3/",
      "http://0.0.0.0/",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://192.168.1.10/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.1.1/",
      "http://224.0.0.1/",
      "http://255.255.255.255/",
      "http://2130706433/", // 127.0.0.1 as one number
      "http://0x7f000001/", // hex
      "http://0177.0.0.1/", // octal
      "http://[::1]/",
      "http://[::]/",
      "http://[fe80::1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456::1]/",
      "http://[ff02::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:192.168.0.1]/",
      "http://[64:ff9b::a00:1]/",
    ]) {
      assert.throws(() => checkPageUrl(url), refusedWith("blocked_address"), url);
    }
  });

  it("accepts public http(s) links on the standard ports", () => {
    for (const url of ["https://www.brico.be/nl/osb", "http://example.com:80/", "https://example.com:443/x", "http://example.com:443/", "https://8.8.8.8/", "https://[2a00:1450:4001::64]/"]) {
      assert.equal(checkPageUrl(url).protocol.startsWith("http"), true, url);
    }
  });
});

describe("guardedGet", () => {
  const html = { headers: { "content-type": "text/html" }, body: "<title>ok</title>" };

  it("refuses a host whose DNS answer is private, loopback, mapped or mixed, and an unknown host", async () => {
    for (const addresses of [["127.0.0.1"], ["10.1.2.3"], ["192.168.1.10"], ["169.254.169.254"], ["100.100.100.100"], ["::1"], ["fd00::1"], ["::ffff:10.0.0.1"], ["93.184.215.14", "192.168.0.1"]]) {
      const transport = fakePageTransport({ "https://evil.example/": html }, { "evil.example": addresses });
      await assert.rejects(guardedGet("https://evil.example/", { transport }), refusedWith("blocked_address"), addresses.join(","));
      assert.equal(transport.requests.length, 0, "no request was sent");
    }
    const transport = fakePageTransport({}, { "nowhere.example": [] });
    await assert.rejects(guardedGet("https://nowhere.example/", { transport }), refusedWith("not_found"));
  });

  it("checks every redirect again and stops after 3", async () => {
    const redirect = (location: string) => ({ status: 302, headers: { location } });
    const transport = fakePageTransport(
      {
        "https://shop.example/to-loopback": redirect("http://127.0.0.1/admin"),
        "https://shop.example/to-local": redirect("http://nas.local/"),
        "https://shop.example/to-rebound": redirect("https://rebind.example/"),
        "https://shop.example/to-port": redirect("https://shop.example:8443/"),
        "https://shop.example/to-file": redirect("file:///etc/passwd"),
        "https://shop.example/to-creds": redirect("https://admin:admin@shop.example/"),
        "https://shop.example/r1": redirect("/r2"),
        "https://shop.example/r2": redirect("/r3"),
        "https://shop.example/r3": redirect("/r4"),
        "https://shop.example/r4": redirect("/final"),
        "https://shop.example/final": html,
      },
      { "rebind.example": ["192.168.0.1"] },
    );
    await assert.rejects(guardedGet("https://shop.example/to-loopback", { transport }), refusedWith("blocked_address"));
    await assert.rejects(guardedGet("https://shop.example/to-local", { transport }), refusedWith("blocked_address"));
    await assert.rejects(guardedGet("https://shop.example/to-rebound", { transport }), refusedWith("blocked_address"));
    await assert.rejects(guardedGet("https://shop.example/to-port", { transport }), refusedWith("unsafe_url"));
    await assert.rejects(guardedGet("https://shop.example/to-file", { transport }), refusedWith("unsafe_url"));
    await assert.rejects(guardedGet("https://shop.example/to-creds", { transport }), refusedWith("unsafe_url"));
    assert.ok(!transport.requests.some((url) => /127\.0\.0\.1|nas\.local|rebind|8443|admin@/.test(url)), "never requested a refused hop");
    await assert.rejects(guardedGet("https://shop.example/r1", { transport }), refusedWith("too_many_redirects"));
    const { url } = await guardedGet("https://shop.example/r2", { transport });
    assert.equal(url.toString(), "https://shop.example/final", "3 redirects are fine");
  });

  it("times out", async () => {
    const transport: PageTransport = {
      resolve: async () => [{ address: "93.184.215.14", family: 4 }],
      open: (_url, _address, _headers, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    await assert.rejects(guardedGet("https://slow.example/", { transport, timeoutMs: 50 }), refusedWith("timeout"));
  });
});

describe("internet transport", () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(zlib.gzipSync("<title>zipped</title>" + "x".repeat(5000)));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain", "x-host": req.headers.host ?? "", "x-cookie": req.headers.cookie ?? "none" });
    res.end("y".repeat(10_000));
  });
  const ready = new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
  after(() => server.close());

  it("connects to the pinned address whatever the host name resolves to, decompresses and caps the body", async () => {
    const port = await ready;
    const signal = AbortSignal.timeout(5000);
    // "pinned.invalid" never resolves: the request can only work through the pinned address.
    const plain = await internetTransport.open(new URL(`http://pinned.invalid:${port}/`), { address: "127.0.0.1", family: 4 }, { "User-Agent": "test" }, signal);
    assert.equal(plain.status, 200);
    assert.equal(plain.headers["x-host"], `pinned.invalid:${port}`, "the Host header keeps the name");
    assert.equal(plain.headers["x-cookie"], "none", "no cookies are sent");
    const capped = await plain.read(1000);
    assert.equal(capped.bytes.byteLength, 1000);
    assert.equal(capped.truncated, true);

    const zipped = await internetTransport.open(new URL(`http://pinned.invalid:${port}/gzip`), { address: "127.0.0.1", family: 4 }, {}, signal);
    const body = await zipped.read(100_000);
    assert.match(body.bytes.toString(), /^<title>zipped<\/title>x+$/);
    assert.equal(body.truncated, false);
  });
});

describe("readPage", () => {
  it("returns product fields, title and trimmed text, marks big pages partial, refuses non-text and reports blocks", async () => {
    const big = "<html><body><main>" + `<p>${"Een lange alinea over gipsplaten en hoe je ze plaatst. ".repeat(200)}</p>`.repeat(220) + "</main></body></html>";
    const fake = installFakeWeb({
      ...FAKE_PAGES,
      "https://big.example/": { body: big },
      "https://img.example/a.png": { headers: { "content-type": "image/png" }, body: "PNG" },
      "https://docs.example/a.pdf": { headers: { "content-type": "application/pdf" }, body: "%PDF" },
      "https://blocked.example/": { status: 429, body: "slow down" },
      "https://gone.example/": { status: 404, body: "gone" },
    });
    try {
      const page = await readPage("https://www.brico.be/nl/osb-plaat-tand-en-groef-18mm-244x59cm/10021535");
      assert.equal(page.product?.price, 14.99);
      assert.equal(page.product?.currency, "EUR");
      assert.equal(page.product?.availability, "in stock");
      assert.equal(page.product?.ean, "5400392020771");
      assert.equal(page.product?.shop, "Brico");
      assert.match(page.title ?? "", /OSB-plaat/);
      assert.match(page.text, /Klasse 3 OSB-plaat/);
      assert.doesNotMatch(page.text, /Assortiment · Klusadvies/, "menus are dropped");
      assert.equal(page.recipe, null);

      const recipe = (await readPage("https://www.kookboek.example/recepten/spaghetti-bolognese")).recipe;
      assert.equal(recipe?.name, "Spaghetti bolognese");
      assert.equal(recipe?.servings, 4);
      assert.equal(recipe?.ingredients.length, 6);
      assert.equal(recipe?.imageUrl, "https://www.kookboek.example/img/spaghetti.jpg");

      const partial = await readPage("https://big.example/");
      assert.equal(partial.partial, true);
      assert.ok(partial.text.length <= 2_900, `text is trimmed (${partial.text.length})`);
      assert.equal(partial.textCut, true);

      await assert.rejects(readPage("https://img.example/a.png"), (error: unknown) => error instanceof WebPageError && error.code === "not_text");
      assert.match((await readPage("https://docs.example/a.pdf")).note ?? "", /PDF/);
      await assert.rejects(readPage("https://blocked.example/"), (error: unknown) => error instanceof WebPageError && error.code === "blocked");
      await assert.rejects(readPage("https://gone.example/"), (error: unknown) => error instanceof WebPageError && error.code === "http_error");
      await assert.rejects(readPage("http://192.168.0.1/"), (error: unknown) => error instanceof WebPageError && error.code === "blocked_address");
      assert.ok(!fake.pages.requests.some((url) => url.includes("192.168")));
    } finally {
      fake.uninstall();
    }
  });
});

describe("extractPage", () => {
  const base = new URL("https://shop.example/p/1");

  it("reads JSON-LD products inside @graph, aggregate offers and product groups", () => {
    const graph = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},{"@type":["Product"],"name":"Boormachine X","brand":{"@type":"Brand","name":"Bosch"},"gtin13":"4059952512345","image":["/img/x.jpg"],"offers":{"@type":"AggregateOffer","lowPrice":"89.99","highPrice":"119","priceCurrency":"EUR","offers":[{"@type":"Offer","price":"89.99","seller":{"@type":"Organization","name":"bol.com"}}]}}]}</script>`;
    const product = extractPage(`<html><head>${graph}</head><body><p>Hi</p></body></html>`, base).product;
    assert.equal(product?.name, "Boormachine X");
    assert.equal(product?.brand, "Bosch");
    assert.equal(product?.price, 89.99);
    assert.equal(product?.highPrice, 119);
    assert.equal(product?.ean, "4059952512345");
    assert.equal(product?.imageUrl, "https://shop.example/img/x.jpg");

    const group = `<script type="application/ld+json">{"@type":"ProductGroup","name":"Verf wit","hasVariant":[{"@type":"Product","name":"Verf wit 1 l","offers":{"@type":"Offer","price":12.5,"priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}}]}</script>`;
    const variant = extractPage(`<html><head>${group}</head><body></body></html>`, base).product;
    assert.equal(variant?.price, 12.5);
    assert.equal(variant?.availability, "out of stock");
  });

  it("reads a price per unit (per m²) and the product's own description", () => {
    const ld = `<script type="application/ld+json">{"@type":"Product","name":"OSB 18mm","description":"Klasse 3 OSB-plaat.","offers":{"@type":"Offer","price":14.99,"priceCurrency":"EUR",
      "eligibleTransactionVolume":{"@type":"UnitPriceSpecification","price":10.42,"priceCurrency":"EUR","eligibleQuantity":{"@type":"QuantitativeValue","value":1,"unitCode":"MTK"}}}}</script>`;
    const page = extractPage(`<html><head>${ld}</head><body></body></html>`, base);
    assert.deepEqual(page.product?.unitPrice, { price: 10.42, unit: "m²" });
    assert.equal(page.description, "Klasse 3 OSB-plaat.");
  });

  it("falls back to microdata and OpenGraph tags", () => {
    const micro = `<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Schroeven 4x40</h1><span itemprop="brand">Spax</span>
      <div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="EUR"><span itemprop="price" content="7.49">€ 7,49</span>
      <link itemprop="availability" href="https://schema.org/InStock"></div></div>`;
    const fromMicro = extractPage(`<html><body>${micro}</body></html>`, base).product;
    assert.equal(fromMicro?.name, "Schroeven 4x40");
    assert.equal(fromMicro?.price, 7.49);
    assert.equal(fromMicro?.availability, "in stock");

    const og = `<meta property="og:type" content="product"><meta property="og:title" content="Tegellijm 25 kg"><meta property="og:site_name" content="Praxis">
      <meta property="product:price:amount" content="19,95"><meta property="product:price:currency" content="EUR">`;
    const fromOg = extractPage(`<html><head>${og}</head><body></body></html>`, base).product;
    assert.equal(fromOg?.price, 19.95);
    assert.equal(fromOg?.shop, "Praxis");
  });

  it("reads a JSON-LD recipe: yield, ingredients and steps in every shape (sections, HowToStep name, text, HTML)", () => {
    const recipe = extractPage(FAKE_PAGES["https://www.kookboek.example/recepten/spaghetti-bolognese"]?.body ?? "", base).recipe;
    assert.equal(recipe?.name, "Spaghetti bolognese");
    assert.equal(recipe?.servings, 4);
    assert.equal(recipe?.yield, "4");
    assert.deepEqual(recipe?.ingredients.slice(0, 3), ["400 g spaghetti", "500 g gehakt", "2 teentjes look"]);
    assert.equal(recipe?.ingredients[5], "Parmezaanse kaas & peper", "entities decoded");
    assert.deepEqual(recipe?.steps, [
      "Bak het gehakt rul in een pan.",
      "Voeg de look en de tomaten toe en laat 20 min sudderen.",
      "Kook de spaghetti 10 minuten.",
      "Werk af met basilicum en kaas.",
    ]);
    assert.equal(recipe?.stepsCut, false);
    assert.equal(extractPage(FAKE_PAGES["https://www.klusforum.be/osb-zoldervloer-tips"]?.body ?? "", base).recipe, null);

    const plainSteps = `<script type="application/ld+json">{"@type":["Recipe"],"name":"Pannenkoeken","recipeYield":"8 stuks","recipeIngredient":["250 g bloem","3 eieren"],"recipeInstructions":"Meng de bloem en de eieren.\\nBak de pannenkoeken."}</script>`;
    const pancakes = extractPage(`<html><head>${plainSteps}</head><body></body></html>`, base).recipe;
    assert.deepEqual(pancakes?.steps, ["Meng de bloem en de eieren.", "Bak de pannenkoeken."]);
    assert.equal(pancakes?.servings, 8);

    const long = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Lang", recipeIngredient: ["a"], recipeInstructions: Array.from({ length: 30 }, (_, index) => `Stap ${index}: ${"roer ".repeat(80)}`) })}</script>`;
    const cut = extractPage(`<html><head>${long}</head><body></body></html>`, base).recipe;
    assert.equal(cut?.stepsCut, true);
    assert.ok((cut?.steps.join("").length ?? 0) <= 3_000);
  });

  it("reads servings from a recipe's yield", () => {
    assert.equal(servingsFromYield("4 personen"), 4);
    assert.equal(servingsFromYield(6), 6);
    assert.equal(servingsFromYield(["", "2 servings"]), 2);
    assert.equal(servingsFromYield("een grote pot"), null);
    assert.equal(servingsFromYield("500"), null);
  });

  it("has no product on an article and keeps the main text", () => {
    const page = extractPage(FAKE_PAGES["https://www.klusforum.be/osb-zoldervloer-tips"]?.body ?? "", base);
    assert.equal(page.product, null);
    assert.match(page.text, /halfsteens verband/);
  });

  it("parses prices the way shops write them", () => {
    assert.equal(parsePrice("14.99"), 14.99);
    assert.equal(parsePrice(14.99), 14.99);
    assert.equal(parsePrice("14,99"), 14.99);
    assert.equal(parsePrice("€ 1.299,00"), 1299);
    assert.equal(parsePrice("1,299.50"), 1299.5);
    assert.equal(parsePrice("1.299"), 1299);
    assert.equal(parsePrice("gratis"), null);
  });

  it("cuts text at a line end near the budget", () => {
    const { text, cut } = trimText("Regel een.\n".repeat(500), 1000);
    assert.equal(cut, true);
    assert.ok(text.length <= 1002);
  });
});

describe("searchWeb", () => {
  it("returns compact results, filters by site and respects the limit", async () => {
    const fake = installFakeWeb();
    try {
      const all = await searchWeb("osb plaat 18mm", { limit: 20 });
      assert.ok(all.results.length <= 8);
      assert.deepEqual(Object.keys(all.results[0] ?? {}).sort(), ["domain", "published", "snippet", "title", "url"]);
      assert.equal(all.results[0]?.domain, "brico.be");
      const hubo = await searchWeb("osb plaat", { site: "https://www.hubo.be/nl/" });
      assert.equal(hubo.query, "osb plaat site:hubo.be");
      assert.ok(hubo.results.every((result) => result.domain === "hubo.be"));
      assert.equal((await searchWeb("osb", { limit: 1 })).results.length, 1);
    } finally {
      fake.uninstall();
    }
  });

  it("says when search is not configured and validates the URL", async () => {
    assert.equal(readWebSettings({}).url, null);
    assert.equal(readWebSettings({ SEARCH_URL: "ftp://x" }).problem, "invalid_url");
    assert.equal(readWebSettings({ SEARCH_URL: "http://127.0.0.1:8888", SEARCH_LANGUAGE: "en-GB" }).language, "en-GB");
    assert.equal(readWebSettings({ SEARCH_URL: "http://127.0.0.1:8888", SEARCH_LANGUAGE: "bad value" }).language, "nl-BE");
    if (!readWebSettings().url) await assert.rejects(searchWeb("x"), (error: unknown) => error instanceof WebSearchError && error.code === "not_configured");
  });

  it("normalises site filters to a domain", () => {
    assert.equal(siteDomain("Gamma.be"), "gamma.be");
    assert.equal(siteDomain("https://www.coolblue.be/nl"), "coolblue.be");
    assert.equal(siteDomain("Gamma"), null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPage } from "./web-extract";

const base = new URL("https://recipes.example/dishes/pasta");
const page = (image: unknown, meta = "") => `<html><head>${meta}<script type="application/ld+json">${JSON.stringify({
  "@graph": [{ "@type": "Recipe", name: "Pasta", recipeIngredient: ["200 g pasta"], image }],
})}</script></head><body><main>Pasta</main></body></html>`;
const og = '<meta property="og:image" content="/photos/social.jpg?width=1200&amp;height=800">';

describe("original recipe photos", () => {
  it("reads strings, arrays and ImageObjects, preferring Recipe.image to OpenGraph", () => {
    for (const image of ["/photos/pasta.jpg", ["/photos/pasta.jpg", "/photos/other.jpg"], { "@type": "ImageObject", url: "/photos/pasta.jpg" }, [{ "@type": "ImageObject", contentUrl: "/photos/pasta.jpg" }], [null, {}, "/photos/pasta.jpg"]]) {
      const extracted = extractPage(page(image, og), base);
      assert.equal(extracted.recipe?.imageUrl, "https://recipes.example/photos/pasta.jpg");
      assert.equal(extracted.imageUrl, extracted.recipe?.imageUrl);
    }
  });

  it("falls back to og:image for missing or unsafe Recipe.image", () => {
    for (const image of [undefined, [], {}, "javascript:alert(1)", "data:image/png;base64,AAA"]) {
      const extracted = extractPage(page(image, og), base);
      assert.equal(extracted.recipe?.imageUrl, "https://recipes.example/photos/social.jpg?width=1200&height=800");
    }
  });

  it("returns og:image even without structured recipe data", () => {
    const extracted = extractPage(`<html><head>${og}</head><body><main>Pasta recipe</main></body></html>`, base);
    assert.equal(extracted.recipe, null);
    assert.equal(extracted.imageUrl, "https://recipes.example/photos/social.jpg?width=1200&height=800");
    assert.equal(extractPage(page(undefined), base).imageUrl, null);
  });

  it("preserves long original URLs without truncating their query string", () => {
    const url = `https://cdn.example/pasta.jpg?signature=${"a".repeat(600)}`;
    assert.equal(extractPage(page(url), base).recipe?.imageUrl, url);
    assert.equal(extractPage(page(`https://cdn.example/${"a".repeat(2000)}`), base).imageUrl, null);
  });
});

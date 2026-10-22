/** The product form's webshop link: which shop a pasted URL belongs to, where it is saved, the main link. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkShopFor, mainShopLink, shopForUrl, urlHost } from "@/features/shopping/types/shop-links";

const shops = [
  { id: "colruyt", websiteUrl: "https://www.colruyt.be" },
  { id: "collect", websiteUrl: "https://www.collectandgo.be/" },
  { id: "delhaize", websiteUrl: "https://www.delhaize.be" },
  { id: "bakker", websiteUrl: null },
  { id: "colruyt-wine", websiteUrl: "https://wijn.colruyt.be" },
];

describe("webshop links", () => {
  it("reads the host without www", () => {
    assert.equal(urlHost("https://WWW.Colruyt.be/nl/producten/123"), "colruyt.be");
    assert.equal(urlHost("not a url"), null);
  });

  it("finds the shop by domain, subdomains included, the most specific first", () => {
    assert.equal(shopForUrl("https://www.collectandgo.be/nl/product/bloem-1kg", shops)?.id, "collect");
    assert.equal(shopForUrl("https://shop.delhaize.be/x", shops)?.id, "delhaize");
    assert.equal(shopForUrl("https://wijn.colruyt.be/rode-wijn", shops)?.id, "colruyt-wine");
    assert.equal(shopForUrl("https://www.bol.com/be/nl/p/x", shops), null);
    assert.equal(shopForUrl("https://notcolruyt.be/x", shops), null, "not a mere suffix");
  });

  it("saves the link for the matching shop and sets it as default shop when there is none", () => {
    assert.deepEqual(linkShopFor("https://www.colruyt.be/p/1", shops, null), { shopId: "colruyt", setDefaultShop: true, matched: true });
    assert.deepEqual(linkShopFor("https://www.colruyt.be/p/1", shops, "delhaize"), { shopId: "colruyt", setDefaultShop: false, matched: true });
    assert.deepEqual(linkShopFor("https://www.bol.com/p/1", shops, "delhaize"), { shopId: "delhaize", setDefaultShop: false, matched: false });
    assert.deepEqual(linkShopFor("https://www.bol.com/p/1", shops, null), { shopId: null, setDefaultShop: false, matched: false }, "ask which shop");
  });

  it("takes the default shop's link as the main one, else the first with a URL", () => {
    const links = [
      { shopId: "delhaize", url: null },
      { shopId: "collect", url: "https://www.collectandgo.be/a" },
      { shopId: "colruyt", url: "https://www.colruyt.be/b" },
    ];
    assert.equal(mainShopLink(links, "colruyt")?.shopId, "colruyt");
    assert.equal(mainShopLink(links, "delhaize")?.shopId, "collect");
    assert.equal(mainShopLink([], null), null);
  });
});

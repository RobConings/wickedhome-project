import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { euroCents, productMatch, promotionPrice } from "./collect-and-go-pricing";
import { collectAndGoUrlSchema } from "@/features/shopping/types/collect-and-go";
describe("Collect&Go observed prices and product matching", () => {
  it("uses integer cents and does not invent missing prices", () => {assert.equal(euroCents("Prijs: € 1,62 per stuk"),162);assert.equal(euroCents("€ 1.234,56"),123456);assert.equal(euroCents(null),null);});
  it("applies thresholds only when the requested quantity qualifies", () => {
    assert.equal(promotionPrice(200,1,"-25% vanaf 2 st").estimatedTotalCents,200);
    assert.equal(promotionPrice(200,2,"-25% vanaf 2 st").estimatedTotalCents,300);
    assert.equal(promotionPrice(162,2,"€ 1,28/st vanaf 2 st").estimatedTotalCents,256);
    assert.equal(promotionPrice(100,5,"2+2").estimatedTotalCents,300);
  });
  it("never stacks mix-and-match, service-fee or coupon offers into invented savings", () => {
    for (const conditions of ["-25% vanaf 2 st · Combineer naar keuze","€ 1,28/st vanaf 2 st · Servicekostactie","-25% vanaf 2 st · Xtra"]) assert.deepEqual(promotionPrice(200,2,conditions),{estimatedTotalCents:400,promotionApplied:false,promotionNote:conditions});
    assert.equal(promotionPrice(null,3,"-25% vanaf 2 st").estimatedTotalCents,null);
  });
  it("ranks name matches and never claims a missing dietary restriction matches", () => {
    assert.equal(productMatch("melk lactosevrij","BONI melk 1L"),0);
    assert.equal(productMatch("melk lactosevrij","BONI lactosevrij melk 1L"),100);
    assert.ok(productMatch("volle melk","EVERYDAY Volle melk 1L")>productMatch("volle melk","Halfvolle melk 1L"));
  });
  it("rejects external, HTTP and credential-bearing product URLs", () => {
    assert.ok(collectAndGoUrlSchema.safeParse("https://www.collectandgo.be/nl/assortiment/melk").success);
    for (const value of ["http://www.collectandgo.be/nl/assortiment/melk","https://evil.test/nl/assortiment/melk","https://www.collectandgo.be.evil.test/nl/assortiment/melk","https://u:p@www.collectandgo.be/nl/assortiment/melk","https://www.collectandgo.be:444/nl/assortiment/melk"]) assert.equal(collectAndGoUrlSchema.safeParse(value).success,false);
  });
});

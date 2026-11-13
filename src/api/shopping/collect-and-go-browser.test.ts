import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { checkCollectAndGoPage, setCollectAndGoQuantityOnPage } from "./collect-and-go-browser";
import { openCollectAndGoCart, readCollectAndGoCartOnPage } from "./collect-and-go-cart";
import type { CollectAndGoOffer } from "@/features/shopping/types/collect-and-go";
const enabled=process.env.COLLECTANDGO_BROWSER_TESTS==="1";
let browser:Browser,page:Page,origin="",quantity=2,writes=0,price="1,62";
const offer:CollectAndGoOffer={id:"cg-0000000000000000",name:"Milk",url:"https://www.collectandgo.be/nl/assortiment/milk",image:null,priceCents:162,unitPrice:null,promotion:null,observedAt:"2026-11-12T10:00:00Z",priceContext:"Fixture",quantity:2,score:100,estimatedTotalCents:324,promotionApplied:false,promotionNote:null};
const server=createServer((req,res)=>{
 const url=new URL(req.url!,"http://localhost");if(url.pathname==="/quantity"){quantity=Number(url.searchParams.get("value"));writes++;res.end("ok");return;}
 res.setHeader("Content-Type","text/html; charset=utf-8");res.end(`<html><body><a class="ds-product-tile" href="${offer.url}"><span class="ds-product-tag"><span role="heading">Milk</span></span><div class="ds-product-price__price"><span class="sr-only">Prijs: € ${price} per stuk</span></div><input type="number" value="${quantity}" onblur="fetch('/quantity?value='+this.value)"></a></body></html>`);
});
before(async()=>{if(!enabled)return;await new Promise<void>((done)=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw Error("address");origin=`http://127.0.0.1:${address.port}`;browser=await chromium.launch({headless:true,executablePath:[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/chromium"].find((v)=>v&&existsSync(v))});page=await browser.newPage();});
after(async()=>{if(enabled){await browser.close();await new Promise<void>((done)=>server.close(()=>done()));}});
describe("Collect&Go browser safety and saved basket verification",{skip:!enabled},()=>{
 const cartHtml = (account = '<button>Afmelden</button>', content = `<a class="ds-product-tile" href="${offer.url}"><span class="ds-product-tag"><span role="heading">Milk</span></span><div class="ds-product-price__price"><span class="sr-only">Prijs: € 1,62 per stuk</span></div><input type="number" value="2" onblur="fetch('/quantity?value=99')"></a>`) => `<body>${account}<main><section><h1>Mijn winkelwagen</h1>${content}</section></main></body>`;
 it("reads signed-in cart quantities and observed prices without touching controls",async()=>{await page.goto(origin);await page.setContent(cartHtml());const before=writes;const result=await readCollectAndGoCartOnPage(page);assert.equal(result.authenticated,true);assert.deepEqual(result.items,[{name:"Milk",url:offer.url,quantity:2,unitPriceCents:162}]);assert.equal(writes,before);});
 it("verifies an explicitly empty signed-in cart, rather than guessing from missing rows",async()=>{await page.setContent(cartHtml(undefined,'<p>Je winkelwagen is leeg</p>'));assert.deepEqual((await readCollectAndGoCartOnPage(page)).items,[]);await page.setContent(cartHtml(undefined,'<p>Even laden</p>'));await assert.rejects(readCollectAndGoCartOnPage(page),/could not be verified/);});
 it("rejects guest, hidden-login, incomplete and conflicting cart evidence",async()=>{
   for(const html of [cartHtml('<a>Aanmelden</a>'),cartHtml('<button hidden>Afmelden</button>'),cartHtml(undefined,`<a class="ds-product-tile" href="${offer.url}">Milk</a>`),cartHtml().replace('value="2"','value="-1"'),cartHtml()+"<script>document.querySelector('section').append('Je winkelwagen is leeg')</script>"]){await page.setContent(html);await assert.rejects(readCollectAndGoCartOnPage(page),/could not be verified/);}
 });
 it("discovers the cart link on the observed site and uses GET navigation only",async()=>{
   const methods:string[]=[];await page.route('https://www.collectandgo.be/**',async(route)=>{methods.push(route.request().method());await route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/nl/home')?'<body><a href="/nl/winkelwagen">Winkelwagen</a></body>':cartHtml()});});
   try{await page.goto('https://www.collectandgo.be/nl/home');const before=writes;assert.equal((await openCollectAndGoCart(page,()=>checkCollectAndGoPage(page))).items.length,1);assert.ok(methods.every(method=>method==='GET'));assert.equal(writes,before);await page.setContent('<a href="/nl/checkout">Winkelwagen</a>');await assert.rejects(openCollectAndGoCart(page,()=>checkCollectAndGoPage(page)),/could not be verified/);}finally{await page.unroute('https://www.collectandgo.be/**');}
 });
 it("sets an absolute quantity and verifies persisted state after reload; retry does not add twice",async()=>{await page.goto(origin);const result=await setCollectAndGoQuantityOnPage(page,offer,4);assert.equal(result.verified,true);assert.equal(result.orderPlaced,false);assert.equal(quantity,4);await setCollectAndGoQuantityOnPage(page,offer,4);assert.equal(quantity,4);assert.equal(writes,2);});
 it("refuses a changed price before any write",async()=>{price="1,99";await page.goto(origin);const before=writes;await assert.rejects(setCollectAndGoQuantityOnPage(page,offer,5),/price or promotion changed/);assert.equal(writes,before);});
 it("stops at a human verification challenge",async()=>{await page.setContent("<body>We vermoeden dat je een bot bent. Voltooi de CAPTCHA.</body>");await assert.rejects(checkCollectAndGoPage(page),/human browser check/);});
});

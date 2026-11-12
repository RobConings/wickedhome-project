import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
const directory=path.resolve("dist/storybook");
const index=JSON.parse(await readFile(path.join(directory,"index.json"),"utf8"));
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".woff2":"font/woff2"};
const server=createServer(async(req,res)=>{ const file=path.resolve(directory,`.${new URL(req.url,"http://localhost").pathname}`); if(!file.startsWith(`${directory}${path.sep}`)){res.writeHead(403).end();return;}try{res.writeHead(200,{"Content-Type":mime[path.extname(file)]??"application/octet-stream"}).end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise((done)=>server.listen(0,"127.0.0.1",done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/chromium"].find((v)=>v&&existsSync(v))});
const output=path.resolve(process.env.ASSISTANT_UI_OUTPUT??"/tmp/wickedhome-assistant-ui");await mkdir(output,{recursive:true});
const errors=[],checked=[];
let provider={provider:"local",model:"local-model",connected:false,permission:false,storageReady:true,accountId:null,accounts:[],models:[],local:{model:"local-model",configured:true},usageUrl:"https://chatgpt.com/settings/usage",error:null};
try{
 const page=await browser.newPage();page.on("pageerror",(e)=>errors.push(e.message));
 await page.route("**/api/assistant/provider**",async(route)=>{
   const req=route.request(); if(req.url().endsWith("/pairing")&&req.method()==="POST")return route.fulfill({json:{code:"test-pair-code",server:"https://home.example.test",expiresAt:"2026-11-12T20:00:00Z"}});
   if(req.method()==="DELETE"){provider={...provider,connected:false};return route.fulfill({json:{remoteRevoked:false}});}
   return route.fulfill({json:provider});
 });
 const open=async(title,name,locale="en",theme="dark")=>{const story=Object.values(index.entries).find((s)=>s.title===title&&s.exportName===name);assert.ok(story,`${title}/${name}`);await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=locale:${locale};theme:${theme}`,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.querySelector("#storybook-root")?.childElementCount>0);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);};
 const examples=[["Features/Assistant/Components/AssistantMarkdown","Default"],["Features/Assistant/Components/StructuredResponse","Default"],["Features/Assistant/Components/AssistantProviderSettings","Connected"],["Features/Assistant/Screens/AssistantScreen","Conversation"],["Features/Shopping/Components/CollectAndGoSettings","Default"]];
 for(const locale of ["en","nl"])for(const theme of ["light","dark"])for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   for(const [title,name]of examples){await open(title,name,locale,theme);assert.equal(await page.locator(".sb-errordisplay").filter({visible:true}).count(),0);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow){await page.screenshot({path:path.join(output,"overflow.png")});console.log(await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right}))));}assert.equal(overflow,false,`${title}/${locale}/${theme}/${width} overflow`);checked.push({title,name,locale,theme,width});}
 }
 await page.setViewportSize({width:390,height:844});
 await open("Features/Assistant/Components/AskButton","Default");
 await page.getByRole("button",{name:"Ask the assistant",exact:true}).click();
 const composer=page.getByRole("textbox",{name:"Ask something…",exact:true});
 await composer.fill("Draft kept while expanding");
 await page.getByRole("button",{name:"Open in Assistant",exact:true}).click();
 assert.equal(await composer.inputValue(),"Draft kept while expanding");
 await page.screenshot({path:path.join(output,"fullscreen-mobile.png")});
 await page.getByRole("button",{name:"Conversations",exact:true}).click();
 await page.getByRole("searchbox",{name:"Search conversations",exact:true}).waitFor();
 await page.getByRole("button",{name:"Conversations",exact:true}).click();
 const box=await composer.boundingBox();assert.ok(box&&box.y+box.height<=844,"Composer stays in viewport");
 await page.getByRole("button",{name:"Collapse",exact:true}).click();
 assert.equal(await composer.inputValue(),"Draft kept while expanding");
 await page.keyboard.press("Escape");await page.getByRole("button",{name:"Ask the assistant",exact:true}).waitFor();
 await page.setViewportSize({width:1440,height:900});
 await open("Features/Assistant/Components/AskButton","Default");
 await page.getByRole("button",{name:"Ask the assistant",exact:true}).click();
 await page.getByRole("button",{name:"Open in Assistant",exact:true}).click();
 await page.getByRole("searchbox",{name:"Search conversations",exact:true}).waitFor();
 await page.getByRole("button",{name:"Conversations",exact:true}).click();
 assert.equal(await page.getByRole("searchbox",{name:"Search conversations",exact:true}).isVisible(),false,"Desktop history collapses");
 await page.getByRole("button",{name:"Conversations",exact:true}).click();
 await page.screenshot({path:path.join(output,"fullscreen-desktop.png")});
 await open("Features/Assistant/Components/AssistantMarkdown","Default");
 assert.ok(await page.locator("code .hljs-keyword").count()>0,"Syntax highlighting");assert.equal(await page.locator('a[href^="javascript:"]').count(),0,"Unsafe links never render");assert.equal(await page.locator("#storybook-root script").count(),0,"Raw HTML never executes");
 await open("Features/Assistant/Components/AssistantProviderSettings","Default");
 await page.getByRole("button",{name:"Continue with ChatGPT",exact:true}).click();
 await page.getByRole("heading",{name:"Pair once from your desktop"}).waitFor();assert.match(await page.getByRole("region",{name:"AI assistant",exact:true}).locator("pre").textContent(),/npm run assistant:pair/);
 assert.equal(errors.length,0,JSON.stringify(errors));
 await writeFile(path.join(output,"verification.json"),JSON.stringify({checked:checked.length,errors,scenarios:checked},null,2));
 console.log(`Assistant browser checks passed: ${checked.length} renders plus expansion, draft preservation, safe Markdown, syntax highlighting and pairing UI.`);
}finally{await browser.close();await new Promise((done)=>server.close(done));}

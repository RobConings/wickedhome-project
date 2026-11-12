import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it, mock } from "node:test";
import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { config } from "@/api/lib/config";
import { db } from "@/api/lib/db";
import { errorHandler, requireAppHeader } from "@/api/lib/http";
import { providerRouter } from "./provider.routes";
import { ISSUER } from "./chatgpt-oauth";
let origin="",directory="";
const previous={ key:config.INTEGRATIONS_KEY, storage:config.STORAGE_DIR, publicUrl:config.PUBLIC_URL };
const app=express();app.use(express.json());app.use(requireAppHeader);app.use((req,_res,next)=>{ const id=req.get("x-test-user");if(id)req.user={id,name:id,email:`${id}@example.test`,role:"adult",locale:"en",householdId:"house",householdName:"Test",habitantId:null};next(); });app.use(providerRouter);app.use(errorHandler);
const server=createServer(app);
const nativeFetch=globalThis.fetch;
const call=(path:string,method="GET",body?:unknown,user?:string)=>nativeFetch(`${origin}${path}`,{method,headers:{"X-WickedHome":"1","Content-Type":"application/json",...(user&&{"x-test-user":user})},...(body!==undefined&&{body:JSON.stringify(body)})});
before(async()=>{directory=await mkdtemp(join(tmpdir(),"wh-pairing-test-"));config.STORAGE_DIR=join(directory,"files");config.INTEGRATIONS_KEY=Buffer.alloc(32,9).toString("base64");config.PUBLIC_URL="https://home.example.test";await new Promise<void>((done)=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw Error("address");origin=`http://127.0.0.1:${address.port}`;});
after(async()=>{mock.restoreAll();await new Promise<void>((done)=>server.close(()=>done()));config.STORAGE_DIR=previous.storage;config.INTEGRATIONS_KEY=previous.key;config.PUBLIC_URL=previous.publicUrl;await rm(directory,{recursive:true,force:true});});
describe("desktop pairing HTTP boundary",()=>{
 it("requires a WickedHome session to create or inspect a connection",async()=>{assert.equal((await call("/provider/pairing","POST",{})).status,401);assert.equal((await call("/provider")).status,401);assert.equal((await nativeFetch(`${origin}/provider/pairing`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,403);});
 it("allows only secure transfer origins",async()=>{config.PUBLIC_URL="http://192.168.1.10:3100";try{assert.equal((await call("/provider/pairing","POST",{},"unsafe")).status,409);}finally{config.PUBLIC_URL=previous.publicUrl;config.PUBLIC_URL="https://home.example.test";}});
 it("binds and consumes a signed grant once, keeping tokens out of account status and other users",async()=>{
  const pair=await (await call("/provider/pairing","POST",{},"alice")).json() as {code:string};
  const prepared=await (await call("/provider/pairing/bootstrap","POST",{code:pair.code})).json() as {nonce:string};
  const {privateKey,publicKey}=await generateKeyPair("RS256");const jwk=await exportJWK(publicKey);jwk.kid="pair-test";
  const idToken=await new SignJWT({nonce:prepared.nonce,email:"person@example.test"}).setProtectedHeader({alg:"RS256",kid:"pair-test"}).setIssuer(ISSUER).setAudience("issued-client").setSubject("verified-person").setExpirationTime("5m").sign(privateKey);
  const fetchMock=mock.method(globalThis,"fetch",async(url:unknown,init?:RequestInit)=>{if(String(url)===`${ISSUER}/.well-known/jwks.json`)return new Response(JSON.stringify({keys:[jwk]}));if(String(url)==="https://api.openai.com/v1/models")return new Response(JSON.stringify({models:[]}));return nativeFetch(url as string,init);});
  const input={code:pair.code,clientId:"issued-client",tokens:{access_token:"private-access",refresh_token:"private-refresh",id_token:idToken,token_type:"Bearer",expires_in:3600,scope:"openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"}};
  const userDelegate=db.user; const originalFindUnique=Reflect.get(userDelegate,"findUnique"); Reflect.set(userDelegate,"findUnique",async()=>({disabledAt:null}));
  try{
   assert.equal((await call("/provider/pairing/complete","POST",input)).status,204);
   assert.equal((await call("/provider/pairing/complete","POST",input)).status,410);
   const status=await (await call("/provider", "GET",undefined,"alice")).json();assert.equal(status.accountId,"issued-client");assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes("private-access"));assert.ok(!JSON.stringify(status).includes("private-refresh"));
   const other=await (await call("/provider","GET",undefined,"bob")).json();assert.equal(other.accountId,null);
  }finally{fetchMock.mock.restore();Reflect.set(userDelegate,"findUnique",originalFindUnique);}
 });
 it("invalidates a cancelled pairing and rejects unknown codes",async()=>{
  const pair=await (await call("/provider/pairing","POST",{},"cancel")).json() as {code:string};await call("/provider/pairing","DELETE",undefined,"cancel");assert.equal((await call("/provider/pairing/bootstrap","POST",{code:pair.code})).status,410);assert.equal((await call("/provider/pairing/bootstrap","POST",{code:"x".repeat(43)})).status,410);
 });
});

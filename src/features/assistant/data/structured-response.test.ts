import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { assistantHrefSchema, structuredResponseSchema, type StructuredResponse } from "../types/response-components";
import { applyEvent, itemsFromMessages } from "./chat-state";
const response: StructuredResponse = {version:1,components:[{type:"shopping",title:"Shopping",items:[{id:"milk",label:"Milk",group:"Collect&Go",detail:"2 packs",href:"/shopping"}]}]};
describe("versioned trusted assistant components",()=>{
  it("rejects unknown versions, executable content, unsafe links and unbounded payloads",()=>{
    assert.equal(structuredResponseSchema.safeParse({...response,version:2}).success,false);
    assert.equal(structuredResponseSchema.safeParse({version:1,components:[{type:"html",html:"<script>bad()</script>"}]}).success,false);
    for(const href of ["javascript:alert(1)","data:text/html,bad","//evil.test","/\\evil.test"]) assert.equal(assistantHrefSchema.safeParse(href).success,false);
    assert.equal(structuredResponseSchema.safeParse({version:1,components:[{type:"shopping",title:"Large",items:Array.from({length:101},()=>({id:"x",label:"x"}))}]}).success,false);
  });
  it("restores the same structured content from saved tool results and deduplicates replay",()=>{
    const historical=itemsFromMessages([{id:"m1",role:"tool",content:"",createdAt:"2026-11-12T00:00:00Z",tool:{name:"shopping.list",status:"done",summary:"Checked list",permission:"read",allowRemember:false,error:null,response}}]);
    const live=applyEvent([],{type:"structured_response",messageId:"m1",response});
    assert.deepEqual(historical.find((item)=>item.kind==="structured"),live[0]);
    assert.deepEqual(applyEvent(live,{type:"structured_response",messageId:"m1",response}),live);
  });
});

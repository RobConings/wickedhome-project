import assert from "node:assert/strict";
import { it } from "node:test";
import { z } from "zod";
import { registerAssistantTool, unregisterAssistantTool } from "../tools";
import { resolveConfirmation, runAssistantLoop, type LoopDeps, type LoopMessage } from "../assistant-loop";
import { createResponsesModel } from "./responses-client";

it("continues a Responses conversation through WickedHome confirmation and audit boundaries", async () => {
  let writes=0, requests=0;
  const tool=registerAssistantTool({name:"providertest.change",description:"Test confirmed write",input:z.object({name:z.string()}),permission:"sensitive",confirm:"always",activity:{en:"Changed item",nl:"Item aangepast"},run:()=>{writes++;return {changed:true};}});
  const history:LoopMessage[]=[{id:"question",role:"user",content:"Change the item"}];
  const rows=new Map<string,LoopMessage>();
  const fetcher:typeof fetch=async (_url,init)=>{
    requests++; const body=JSON.parse(String(init?.body)) as {input:{type?:string;call_id?:string}[]};
    const events=requests===1 ? [{type:"response.completed",response:{output:[{type:"function_call",namespace:"wickedhome",name:"providertest_change",call_id:"call-1",arguments:'{"name":"Milk"}'}]}}] : [{type:"response.output_text.delta",delta:"Done."},{type:"response.completed",response:{output:[]}}];
    if(requests===2) assert.ok(body.input.some((item)=>item.type==="function_call_output"&&item.call_id==="call-1"));
    return new Response(events.map((event)=>`data: ${JSON.stringify(event)}\n\n`).join(""));
  };
  const deps:LoopDeps={ model:createResponsesModel("available",async()=>"oauth",fetcher),tools:[tool],ctx:{user:{id:"user",name:"User",email:"test@example.test",role:"adult",locale:"en",householdId:"house",householdName:"Test",habitantId:null},householdId:"house",locale:"en",signal:new AbortController().signal,channel:"chat"},systemPrompt:"Use the registered tool, then report its actual result.",rememberedSkips:new Set([tool.name]),save:async(message)=>{const row={...message,id:`m${rows.size}`};rows.set(row.id,row);return row;},update:async(id,patch)=>{Object.assign(rows.get(id)!,patch);},remember:async()=>undefined,emit:()=>undefined };
  try {
    assert.equal(await runAssistantLoop(history,deps),"paused"); assert.equal(writes,0);
    const pending=history.find((message)=>message.toolStatus==="pending"); assert.ok(pending);
    assert.equal(await resolveConfirmation(history,pending.id,{decision:"confirm"},deps),"done");
    assert.equal(writes,1);assert.equal(requests,2);
    assert.equal(history.at(-1)?.content,"Done.");
  } finally {unregisterAssistantTool(tool.name);}
});

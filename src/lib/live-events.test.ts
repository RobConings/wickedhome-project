import assert from "node:assert/strict";
import { it } from "node:test";
import { LiveEventsConnection } from "./live-events";

it("shares live updates, reconnects and reloads current state on each ready event", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  class Source extends EventTarget {
    static CLOSED = 2;
    static instances: Source[] = [];
    readyState = 1;
    closed = false;
    constructor() { super(); Source.instances.push(this); }
    close() { this.closed = true; this.readyState = Source.CLOSED; }
    send(type: string) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify({ type, at: new Date().toISOString(), data: { sessionId: "visit" } }) })); }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  Object.defineProperty(globalThis, "EventSource", { configurable: true, value: Source });
  t.after(() => { if (original) Object.defineProperty(globalThis, "EventSource", original); else Reflect.deleteProperty(globalThis, "EventSource"); });
  const connection = new LiveEventsConnection();
  let reloads = 0; let firstDevice = 0; let secondDevice = 0;
  const ready = connection.on("ready", () => { reloads += 1; });
  const first = connection.on("shopping.changed", () => { firstDevice += 1; });
  const second = connection.on("shopping.changed", () => { secondDevice += 1; });
  const source = Source.instances[0]!;
  assert.equal(Source.instances.length, 1);
  source.send("ready"); source.send("shopping.changed");
  assert.equal(firstDevice, 1); assert.equal(secondDevice, 1);
  source.readyState = Source.CLOSED; source.dispatchEvent(new Event("error"));
  t.mock.timers.tick(2000);
  assert.equal(Source.instances.length, 2);
  Source.instances[1]!.send("ready"); Source.instances[1]!.send("shopping.changed");
  assert.equal(reloads, 2, "reconnect fetches the current state instead of relying on missed events");
  assert.equal(firstDevice, 2); assert.equal(secondDevice, 2);
  ready(); first(); second();
  assert.equal(Source.instances[1]!.closed, true);
});

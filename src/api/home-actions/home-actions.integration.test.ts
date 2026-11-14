import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { WebSocketServer, type WebSocket } from "ws";
import express from "express";

test("household action persistence, publication, isolation, idempotence and observed results", { skip: process.env.HOME_ACTIONS_INTEGRATION_TESTS !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.port, "55432"); assert.match(database.pathname, /_test$/);
  const householdId = `home-actions-test-${randomUUID()}`, otherId = `home-actions-other-${randomUUID()}`;
  const configurations = new Map<string, unknown>(), subscriptions = new Map<string, number>(), calls: { domain: string; service: string; variables?: Record<string, unknown> }[] = [];
  const states = [{ entity_id: "climate.hc1", state: "auto", attributes: { supported_features: 17, hvac_modes: ["auto", "heat"], temperature: 19, min_temp: 5, max_temp: 30 } }, { entity_id: "script.wickedhome_actions", state: "off", attributes: {} }, { entity_id: "alarm_control_panel.test", state: "disarmed", attributes: { supported_features: 3, code_arm_required: true } }];
  const fake = createServer(async (req, res) => {
    const key = req.url ?? "";
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") { if (!configurations.has(key)) { res.statusCode = 404; res.end("{}"); } else res.end(JSON.stringify(configurations.get(key))); return; }
    let text = ""; for await (const chunk of req) text += chunk;
    configurations.set(key, JSON.parse(text)); res.end('{"result":"ok"}');
  });
  fake.listen(0, "127.0.0.1"); await once(fake, "listening");
  const address = fake.address(); assert.ok(address && typeof address === "object");
  process.env.HOME_ASSISTANT_URL = `http://127.0.0.1:${address.port}`; process.env.HOME_ASSISTANT_TOKEN = "integration-fixture-token"; process.env.HOME_ASSISTANT_HOUSEHOLD_ID = householdId;
  const sockets = new WebSocketServer({ server: fake }); let socket: WebSocket | undefined;
  const event = (type: string, data: unknown) => { const id = subscriptions.get(type); if (socket && id) socket.send(JSON.stringify({ id, type: "event", event: { event_type: type, data } })); };
  const scriptState = (state: string) => { states[1]!.state = state; event("state_changed", { entity_id: states[1]!.entity_id, old_state: null, new_state: states[1] }); };
  sockets.on("connection", (next) => {
    socket = next; next.send('{"type":"auth_required","ha_version":"2026.10.2"}');
    next.on("message", (raw) => {
      const request = JSON.parse(String(raw));
      if (request.type === "auth") { next.send('{"type":"auth_ok","ha_version":"2026.10.2"}'); return; }
      if (request.type === "subscribe_events") subscriptions.set(request.event_type, request.id);
      let result: unknown = [];
      if (request.type === "get_states") result = states;
      if (request.type === "get_config") result = { unit_system: { temperature: "°C" }, time_zone: "Europe/Brussels" };
      if (request.type === "call_service") {
        const variables = request.service_data?.variables; calls.push({ domain: request.domain, service: request.service, variables });
        if (request.domain === "script" && request.service === "turn_on") setTimeout(() => { scriptState("on"); event("wickedhome_action_progress", { action_id: variables.wh_action_id, revision: variables.wh_revision, run_id: variables.run_id, phase: "started", index: -1 }); }, 10);
        if (request.domain === "script" && request.service === "turn_off") scriptState("off");
      }
      next.send(JSON.stringify({ id: request.id, type: "result", success: true, result }));
    });
  });
  const { db } = await import("../lib/db");
  const connection = await import("../home-assistant/ha-connection");
  const runtime = await import("./home-actions.runtime");
  const service = await import("./home-actions.service");
  const { homeActionsRouter } = await import("./home-actions.routes");
  const { requireAppHeader, errorHandler } = await import("../lib/http");
  const { loadSession } = await import("../lib/session");
  const app = express(); app.use(express.json(), requireAppHeader, loadSession); app.use("/api/home-actions", homeActionsRouter); app.use(errorHandler);
  const apiServer = app.listen(0, "127.0.0.1"); await once(apiServer, "listening"); const apiAddress = apiServer.address(); assert.ok(apiAddress && typeof apiAddress === "object"); const apiUrl = `http://127.0.0.1:${apiAddress.port}/api/home-actions`;
  const wait = async (condition: () => Promise<boolean> | boolean) => { const deadline = Date.now() + 5000; while (!await condition()) { if (Date.now() > deadline) throw Error("Integration wait timed out"); await new Promise((resolve) => setTimeout(resolve, 20)); } };
  try {
    await db.household.create({ data: { id: householdId, name: "Action test" } }); await db.household.create({ data: { id: otherId, name: "Other test" } });
    const owner = await db.user.create({ data: { householdId, email: `${randomUUID()}@test.invalid`, passwordHash: "not-a-password", role: "OWNER" } });
    const child = await db.user.create({ data: { householdId, email: `${randomUUID()}@test.invalid`, passwordHash: "not-a-password", role: "CHILD" } });
    const profile = await db.deviceProfile.create({ data: { householdId, name: "Thermostat", icon: "thermometer", category: "CLIMATE", fields: [], rules: [] } });
    const device = await db.device.create({ data: { householdId, name: "Heating HC1", profileId: profile.id, values: { create: { fieldKey: "temperature", source: "HOME_ASSISTANT", haEntityId: "climate.hc1", haAttribute: "temperature" } } } });
    const tokens = { owner: randomUUID(), child: randomUUID() };
    for (const [kind, token] of Object.entries(tokens)) await db.session.create({ data: { id: createHash("sha256").update(token).digest("hex"), userId: kind === "owner" ? owner.id : child.id, expiresAt: new Date(Date.now() + 60_000) } });
    const user = { id: owner.id, householdId, householdName: "Test", name: "Test owner", role: "owner" as const, locale: "en" as const, email: owner.email, habitantId: null };
    connection.startHomeAssistant(); runtime.startHomeActionsRuntime(); await wait(() => connection.getEntityState("climate.hc1") !== null);
    const input = { name: "Leave", icon: "log-out" as const, favourite: true, contactDeviceIds: [], alarmMode: null, steps: [{ kind: "device" as const, deviceId: device.id, entityId: "climate.hc1", action: "temperature" as const, value: 18, onFailure: "stop" as const }] };
    assert.equal((await fetch(apiUrl)).status, 401);
    assert.equal((await fetch(`${apiUrl}/actions`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `wh_session=${tokens.owner}` }, body: JSON.stringify({ definition: input }) })).status, 403);
    assert.equal((await fetch(`${apiUrl}/actions`, { method: "POST", headers: { "Content-Type": "application/json", "X-WickedHome": "1", Cookie: `wh_session=${tokens.child}` }, body: JSON.stringify({ definition: input }) })).status, 403);
    await assert.rejects(service.saveHomeAction({ ...user, householdId: otherId }, null, input), /Unknown device/);
    const action = await service.saveHomeAction(user, null, input);
    await assert.rejects(service.saveHomeAction(user, action.id, input, 999), /changed/);
    await service.publishHomeAction(user, action.id, action.revision);
    const before = calls.length; assert.equal((await service.previewHomeAction(user, action.id)).ready, true); assert.equal(calls.length, before, "Dry-run must issue no physical service");
    const request = { revision: action.revision, requestKey: randomUUID() };
    const runs = await Promise.all([service.startHomeAction(user, action.id, request), service.startHomeAction(user, action.id, request)]);
    assert.equal(runs[0]!.id, runs[1]!.id);
    await wait(async () => (await db.homeActionRun.findUnique({ where: { id: runs[0]!.id } }))?.status === "running");
    assert.equal(calls.filter((call) => call.service === "turn_on").length, 1);
    await assert.rejects(service.startHomeAction(user, action.id, { revision: action.revision, requestKey: randomUUID() }), /running/);
    await assert.rejects(service.publishHomeAction(user, action.id, action.revision), /running/);
    const progress = (phase: string, index: number) => event("wickedhome_action_progress", { action_id: action.id, revision: action.revision, run_id: runs[0]!.id, phase, index });
    progress("requested", 0); states[0]!.attributes.temperature = 18; event("state_changed", { entity_id: "climate.hc1", old_state: null, new_state: states[0] }); progress("confirmed", 0); progress("completed", -1); scriptState("off");
    await wait(async () => (await db.homeActionRun.findUnique({ where: { id: runs[0]!.id } }))?.status === "confirmed");
    progress("requested", 0); await new Promise((resolve) => setTimeout(resolve, 30)); assert.equal((await db.homeActionRun.findUnique({ where: { id: runs[0]!.id } }))?.status, "confirmed");
    const second = await service.startHomeAction(user, action.id, { revision: action.revision, requestKey: randomUUID() }); await wait(async () => (await db.homeActionRun.findUnique({ where: { id: second.id } }))?.status === "running"); await service.stopHomeAction(user, second.id); assert.equal((await db.homeActionRun.findUnique({ where: { id: second.id } }))?.status, "cancelled");
    const alarmAction = await service.saveHomeAction(user, null, { ...input, name: "Alarm action", alarmMode: "away" });
    await assert.rejects(service.saveHomeRule(user, null, { name: "Unsafe unattended alarm", actionId: alarmAction.id, trigger: { kind: "time", at: "22:30" }, weekdays: ["mon"], cooldownSeconds: 60, enabled: false }), /manually/);
    const nativeKey = "/api/config/script/config/wickedhome_actions"; configurations.set(nativeKey, { editedOutsideWickedHome: true });
    await assert.rejects(service.startHomeAction(user, action.id, { revision: action.revision, requestKey: randomUUID() }), /configuration changed/);
    assert.ok((await db.auditEntry.count({ where: { householdId, action: "home_action.started" } })) > 0);
  } finally {
    await runtime.stopHomeActionsRuntime(); await connection.stopHomeAssistant();
    await db.homeActionRun.deleteMany({ where: { householdId } }); await db.homeRule.deleteMany({ where: { householdId } }); await db.homeAction.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: { in: [householdId, otherId] } } }); await db.$disconnect();
    apiServer.close(); sockets.clients.forEach((client) => client.terminate()); sockets.close(); fake.close();
  }
});

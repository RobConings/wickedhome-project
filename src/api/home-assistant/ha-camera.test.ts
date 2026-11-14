import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeCamera } from "./ha-camera";
import { cameraStreamRoot, MAX_CAMERA_BYTES, readCameraMedia, rewriteCameraPlaylist } from "./ha-camera-media";
import { initialHaPosition, matchHaRoom } from "./ha-import-location";
import type { HaState } from "./ha-client";
import type { Place } from "@/features/places/types/places";
import { isPointInPolygon } from "@/features/places/types/plan-geometry";
import express from "express";
import type { AddressInfo } from "node:net";
import type { SessionUser } from "@/features/auth/types/auth";
import { homeAssistantRouter } from "./home-assistant.routes";
import { errorHandler, requireAppHeader } from "../lib/http";
import { devicePresetProfile } from "@/features/devices/types/device-presets";
import { deviceProfileInputSchema } from "@/features/devices/types/devices";
import { suggestPreset, toHaEntity } from "./ha-state-mapping";

const state = (value = "idle", features = 0): HaState => ({ entity_id: "camera.garage", state: value, attributes: { friendly_name: "Garage", supported_features: features } });
describe("Camera capabilities", () => {
  it("separates Verisure capture from actual stream support, including garage cameras", () => {
    assert.deepEqual(describeCamera(state(), "verisure", true), { entityId: "camera.garage", name: "Garage", available: true, canCapture: true, canStream: false });
    assert.equal(describeCamera(state("idle", 2), "generic", false)?.canStream, true);
    assert.equal(describeCamera(state(), "generic", true)?.canCapture, false);
    assert.equal(describeCamera(state(), "verisure", false)?.canCapture, false);
  });
  it("never offers physical actions when unavailable or for another entity kind", () => {
    for (const value of ["unknown", "unavailable"]) {
      const camera = describeCamera(state(value, 2), "verisure", true)!;
      assert.equal(camera.canCapture, false); assert.equal(camera.canStream, false);
    }
    assert.equal(describeCamera({ ...state(), entity_id: "alarm_control_panel.home" }, "verisure", true), null);
  });
  it("imports cameras with a valid localized profile and the status binding used by the map", () => {
    assert.deepEqual(suggestPreset(toHaEntity(state(), 'Kelder/Garage')), { presetKey: 'camera', fieldKey: 'state' });
    for (const locale of ['en', 'nl'] as const) {
      const profile = deviceProfileInputSchema.parse(devicePresetProfile('camera', locale));
      assert.equal(profile.category, 'camera'); assert.equal(profile.primaryField, 'state'); assert.equal(profile.icon, 'camera');
      assert.equal(profile.rules.find((rule) => rule.value === 'idle')?.tone, 'success');
    }
  });
});

describe("Private camera media", () => {
  const source = new URL("http://ha.local:8123/api/hls/private-token/master_playlist.m3u8");
  const root = cameraStreamRoot(source, new URL("http://ha.local:8123"));
  it("replaces playlists, initialization files and segments with opaque local asset URLs", () => {
    const registered: URL[] = [];
    const text = rewriteCameraPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment/1.m4s\n', source, root, (url) => { registered.push(url); return `/private-camera/${registered.length}`; });
    assert.equal(registered.length, 2); assert.ok(text.includes('URI="/private-camera/1"')); assert.ok(text.includes('/private-camera/2'));
    assert.ok(!text.includes("private-token")); assert.ok(!text.includes("ha.local"));
  });
  it("rejects external, cross-session and encoded traversal media references", () => {
    for (const path of ['https://evil.test/movie.ts', '/api/hls/other/segment.ts', '../../states', 'file:///etc/passwd', '%2f..%2fprivate.ts']) {
      assert.throws(() => rewriteCameraPlaylist(`#EXTM3U\n${path}\n`, source, root, () => '/safe'));
    }
    assert.throws(() => cameraStreamRoot(new URL('http://evil.test/api/hls/secret/master.m3u8'), new URL('http://ha.local:8123')));
    assert.throws(() => rewriteCameraPlaylist('not a playlist', source, root, () => '/safe'));
  });
  it("does not follow upstream redirects or expose provider error bodies", async () => {
    let redirect: RequestRedirect | undefined;
    const fetcher: typeof fetch = async (_url, init) => { redirect = init?.redirect; return new Response('private-token-and-provider-error', { status: 302, headers: { location: 'https://evil.test' } }); };
    await assert.rejects(readCameraMedia(source, 'server-only-token', fetcher), (error: Error) => !error.message.includes('private-token') && !error.message.includes('provider-error'));
    assert.equal(redirect, 'error');
  });
  it("bounds streamed response sizes before buffering the full response", async () => {
    let canceled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_CAMERA_BYTES)); controller.enqueue(new Uint8Array(1)); }, cancel() { canceled = true; } });
    await assert.rejects(readCameraMedia(source, 'token', async () => new Response(body, { headers: { 'content-type': 'image/jpeg' } })), /too large/);
    assert.equal(canceled, true);
  });
});

describe("Camera import locations", () => {
  const place = { id: 'kitchen', name: 'Keuken', floorId: 'ground' } as Place;
  it("matches only a unique room name in the supplied household", () => {
    assert.equal(matchHaRoom(' keuken ', [place])?.id, 'kitchen');
    assert.equal(matchHaRoom('Keuken', [place, { ...place, id: 'other-floor' }]), null);
    assert.equal(matchHaRoom('Garage', [place]), null);
  });
  it("starts markers inside concave rooms and leaves undrawn rooms unplaced", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 600 }, { x: 0, y: 600 }];
    for (let index = 0; index < 12; index++) assert.equal(isPointInPolygon(initialHaPosition(polygon, index)!, polygon), true);
    assert.equal(initialHaPosition(null, 0), null);
  });
});

describe("Camera route access", () => {
  it("rejects anonymous and child access to every media/action endpoint before resolving devices", async () => {
    const app = express();
    let role: "child" | "owner" | null = null;
    app.use(express.json(), (req, _res, next) => { if (role) req.user = { id: 'person', householdId: 'home', role } as SessionUser; next(); }, requireAppHeader);
    app.use('/home-assistant', homeAssistantRouter); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/home-assistant/devices/private-device/cameras`;
    const endpoints = [['GET', ''], ['GET', '/image?entityId=camera.kitchen'], ['POST', '/snapshot'], ['POST', '/streams'], ['GET', '/streams/session/asset'], ['DELETE', '/streams/session']] as const;
    try {
      for (const candidate of [null, 'child'] as const) {
        role = candidate;
        for (const [method, path] of endpoints) {
          const response = await fetch(url + path, { method, headers: { 'X-WickedHome': '1', 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ entityId: 'camera.kitchen' }) } : {}) });
          assert.equal(response.status, candidate ? 403 : 401, `${candidate ?? 'anonymous'} ${method} ${path}`);
        }
      }
      role = 'owner';
      assert.equal((await fetch(url + '/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId: 'camera.kitchen' }) })).status, 403);
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});

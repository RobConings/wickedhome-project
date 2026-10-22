/**
 * Rooms by the names people use: "de living" finds the Woonkamer, "kitchen" the Keuken.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/places/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickCandidate } from "@ai/core/resolve";
import { roomAliases } from "./tools";

const rooms = ["Woonkamer", "Keuken", "Slaapkamer Lena", "Badkamer", "Bureau"].map((name, index) => ({ id: `p${index}`, name, aliases: roomAliases(name) }));
const resolve = (query: string) => {
  const outcome = pickCandidate("place", "room", query, rooms, true);
  return outcome.ok ? outcome.entity.name : outcome.error;
};

describe("place resolver aliases", () => {
  it("knows the other words for common rooms, in Dutch and English", () => {
    assert.deepEqual(roomAliases("Woonkamer"), ["living", "zitkamer", "salon", "living room"]);
    assert.deepEqual(roomAliases("Slaapkamer Lena"), ["bedroom lena"]);
    assert.deepEqual(roomAliases("Garage"), []);
    assert.equal(resolve("living"), "Woonkamer");
    assert.equal(resolve("de living"), "Woonkamer");
    assert.equal(resolve("kitchen"), "Keuken");
    assert.equal(resolve("office"), "Bureau");
    assert.equal(resolve("woonkamer"), "Woonkamer");
  });
});

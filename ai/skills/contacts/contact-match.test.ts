/**
 * The `contact` resolver's rules: names, companies and trades (Dutch and English) as aliases, "de aannemer"
 * narrowed to the contractor on a running project, and "which one?" when it stays ambiguous. No database:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/contacts/contact-match.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Contact } from "@/features/contacts/types/contacts";
import { pickCandidate } from "@ai/core/resolve";
import { contactCandidate, contactRefData, narrowContacts, searchWords } from "./contact-match";

const contact = (id: string, name: string, overrides: Partial<Contact> = {}): Contact => ({
  id,
  name,
  company: null,
  trade: null,
  emails: [],
  phones: [],
  address: null,
  websiteUrl: null,
  notes: null,
  shop: null,
  projects: [],
  createdAt: "2026-10-04T10:00:00.000Z",
  updatedAt: "2026-10-04T10:00:00.000Z",
  ...overrides,
});

const bathroom = { id: "p-bath", name: "Badkamer renovatie", color: "#3b82b6", running: true };
const kitchen = { id: "p-kitchen", name: "Keuken", color: "#d4573b", running: false };

const peeters = contact("c-peeters", "Jan Peeters", {
  company: "Bouwbedrijf Peeters",
  trade: "aannemer",
  emails: ["jan@peeters.example.be", "info@peeters.example.be"],
  phones: ["+32 470 11 22 33"],
  projects: [{ ...bathroom, role: "aannemer" }],
});
const claes = contact("c-claes", "Jan Claes", { company: "Claes Renovaties", trade: "aannemer", projects: [{ ...kitchen, role: "aannemer" }] });
const water = contact("c-water", "Waterwerken Janssens", { trade: "loodgieter", phones: ["011 22 33 44"] });
const bank = contact("c-bank", "KBC kantoor Hasselt", { trade: "bank" });
const all = [peeters, claes, water, bank];

/** Resolve like the runner does: the resolver's candidates for the query, then the matcher. */
const resolve = (query: string, contacts = all) => pickCandidate("contact", "contact", query, narrowContacts(query, contacts), false);
const resolvedId = (query: string, contacts = all) => {
  const outcome = resolve(query, contacts);
  return outcome.ok ? outcome.entity.id : outcome.error;
};

describe("contact candidates", () => {
  it("carry company, trade synonyms and '<trade> <project>' as aliases, and the mail/phone data", () => {
    const candidate = contactCandidate(peeters);
    for (const alias of ["Bouwbedrijf Peeters", "aannemer", "contractor", "aannemer Badkamer renovatie", "contractor Badkamer renovatie"]) {
      assert.ok(candidate.aliases?.includes(alias), alias);
    }
    assert.equal(candidate.hint, "aannemer · Bouwbedrijf Peeters");
    assert.deepEqual(candidate.data, contactRefData(peeters));
    assert.deepEqual(contactRefData(peeters), {
      email: "jan@peeters.example.be",
      emails: ["jan@peeters.example.be", "info@peeters.example.be"],
      phone: "+32 470 11 22 33",
      phones: ["+32 470 11 22 33"],
      company: "Bouwbedrijf Peeters",
      trade: "aannemer",
    });
  });

  it("have a null email and phone when there are none", () => {
    assert.equal(contactRefData(bank).email, null);
    assert.equal(contactRefData(bank).phone, null);
  });
});

describe("resolving a contact", () => {
  it("finds by full name, company and unique trade, in Dutch and English", () => {
    assert.equal(resolvedId("Jan Peeters"), "c-peeters");
    assert.equal(resolvedId("Bouwbedrijf Peeters"), "c-peeters");
    assert.equal(resolvedId("de loodgieter"), "c-water");
    assert.equal(resolvedId("the plumber"), "c-water");
    assert.equal(resolvedId("de bank"), "c-bank");
  });

  it("takes the contractor on a running project for 'de aannemer' when two contractors exist", () => {
    assert.equal(resolvedId("de aannemer"), "c-peeters");
    assert.equal(resolvedId("the contractor"), "c-peeters");
  });

  it("uses the project in the reference", () => {
    assert.equal(resolvedId("de aannemer van de keuken"), "c-claes");
    assert.equal(resolvedId("aannemer badkamer"), "c-peeters");
  });

  it("combines a first name with a trade", () => {
    assert.equal(resolvedId("Jan de aannemer", [claes, water, bank]), "c-claes");
  });

  it("asks which one when the name stays ambiguous", () => {
    const outcome = resolve("Jan");
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.error, /Which contact/);
      assert.match(outcome.error, /Jan Peeters \(aannemer · Bouwbedrijf Peeters\)/);
      assert.match(outcome.error, /Jan Claes/);
    }
  });

  it("asks which one for a trade when no contractor is on a running project", () => {
    const finished = { ...peeters, projects: [{ ...bathroom, running: false, role: "aannemer" }] };
    const outcome = resolve("de aannemer", [finished, claes]);
    assert.equal(outcome.ok, false);
  });

  it("says nothing matches for an unknown contact", () => {
    const outcome = resolve("de schilder");
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.error, /No contact matches/);
  });

  it("drops filler words from a reference", () => {
    assert.deepEqual(searchWords("de aannemer van de badkamer"), ["aannemer", "badkamer"]);
    assert.deepEqual(searchWords("the plumber for our kitchen"), ["plumber", "kitchen"]);
  });
});

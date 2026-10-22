/**
 * Contacts: the contract (validation of the input and the posted form), search matching, and the API's role
 * checks and validation over HTTP (an in-process Express app with a fake signed-in user; every request here is
 * refused before the service, so no database is needed). Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/contacts/contacts.test.ts
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import {
  canManageContacts,
  contactFormSchema,
  contactInputSchema,
  findTrade,
  telHref,
  tradeSynonyms,
  type Contact,
} from "@/features/contacts/types/contacts";
import { errorHandler } from "../lib/http";
import { contactsRouter } from "./contacts.routes";
import { contactMatches } from "./contacts.service";

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: "c1",
  name: "Jan Peeters",
  company: "Bouwbedrijf Peeters",
  trade: "aannemer",
  emails: ["jan@example.be"],
  phones: ["+32 470 12 34 56"],
  address: null,
  websiteUrl: null,
  notes: null,
  shop: null,
  projects: [{ id: "p1", name: "Badkamer renovatie", color: "#3b82b6", role: "aannemer", running: true }],
  createdAt: "2026-10-04T10:00:00.000Z",
  updatedAt: "2026-10-04T10:00:00.000Z",
  ...overrides,
});

describe("contact contract", () => {
  it("accepts a contact with only a name and fills the lists", () => {
    const parsed = contactInputSchema.parse({ name: "  De Bank  " });
    assert.equal(parsed.name, "De Bank");
    assert.deepEqual(parsed.emails, []);
    assert.deepEqual(parsed.phones, []);
  });

  it("refuses an empty name, a bad email or phone, duplicates and too many values", () => {
    assert.equal(contactInputSchema.safeParse({ name: " " }).success, false);
    assert.equal(contactInputSchema.safeParse({ name: "Jan", emails: ["not-an-email"] }).success, false);
    const phone = contactInputSchema.safeParse({ name: "Jan", phones: ["call me"] });
    assert.equal(phone.success, false);
    assert.equal(phone.error?.issues[0]?.message, "invalidPhone");
    const duplicate = contactInputSchema.safeParse({ name: "Jan", phones: ["0470 12 34 56", "0470/12.34.56"] });
    assert.equal(duplicate.success, false);
    assert.deepEqual(duplicate.error?.issues[0]?.path, ["phones", 1]);
    assert.equal(duplicate.error?.issues[0]?.message, "duplicateValue");
    assert.equal(contactInputSchema.safeParse({ name: "Jan", emails: ["a@x.be", "b@x.be", "c@x.be", "d@x.be", "e@x.be", "f@x.be"] }).success, false);
  });

  it("lower-cases email addresses and only allows web links", () => {
    assert.deepEqual(contactInputSchema.parse({ name: "Jan", emails: [" Jan@Example.BE "] }).emails, ["jan@example.be"]);
    assert.equal(contactInputSchema.safeParse({ name: "Jan", websiteUrl: "javascript:alert(1)" }).success, false);
  });

  it("reads the posted form: one value per line, website without https://, an optional project link", () => {
    const parsed = contactFormSchema.parse({
      name: "Jan",
      emails: "jan@example.be\n\n info@example.be ",
      phones: "+32 470 12 34 56",
      websiteUrl: "peeters.example.be",
      projectId: "p1",
      projectRole: "aannemer",
    });
    assert.deepEqual(parsed.emails, ["jan@example.be", "info@example.be"]);
    assert.deepEqual(parsed.phones, ["+32 470 12 34 56"]);
    assert.equal(parsed.websiteUrl, "https://peeters.example.be");
    assert.equal(parsed.projectId, "p1");
  });

  it("knows trades in Dutch and English", () => {
    assert.equal(findTrade("Aannemer")?.key, "contractor");
    assert.equal(findTrade("contractor")?.key, "contractor");
    assert.equal(findTrade("glazenwasser"), null);
    assert.deepEqual(tradeSynonyms("Loodgieter").slice(0, 2), ["Loodgieter", "plumber"]);
    assert.deepEqual(tradeSynonyms("glazenwasser"), ["glazenwasser"]);
  });

  it("builds tel: links without separators and lets only owners and adults manage", () => {
    assert.equal(telHref("+32 470/12.34.56"), "tel:+32470123456");
    assert.equal(canManageContacts("owner"), true);
    assert.equal(canManageContacts("adult"), true);
    assert.equal(canManageContacts("child"), false);
  });
});

describe("contactMatches", () => {
  it("finds a contact by name, company, trade in either language, email, phone digits or project", () => {
    const jan = contact();
    for (const query of ["jan", "peeters", "bouwbedrijf", "aannemer", "contractor", "jan@example", "0470123456", "badkamer", "Jan aannemer"]) {
      assert.equal(contactMatches(jan, query), true, query);
    }
  });

  it("needs every word and ignores accents", () => {
    assert.equal(contactMatches(contact(), "jan loodgieter"), false);
    assert.equal(contactMatches(contact({ name: "Renée Claes" }), "renee"), true);
  });
});

describe("contacts API", () => {
  let base = "";
  let role: Role | null = "child";
  const server = (() => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (role) {
        req.user = { id: "u1", email: "u@example.com", name: "Test", role, locale: "nl", householdId: "h1", householdName: "Test", habitantId: null } satisfies SessionUser;
      }
      next();
    });
    app.use("/contacts", contactsRouter);
    app.use(errorHandler);
    return app.listen(0);
  })();

  before(() => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/contacts`;
  });
  after(() => {
    server.close();
  });

  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("needs a signed-in user", async () => {
    role = null;
    assert.equal((await call("GET", "/")).status, 401);
  });

  it("refuses children every change", async () => {
    role = "child";
    const valid = { name: "Jan Peeters" };
    assert.equal((await call("POST", "/", valid)).status, 403);
    assert.equal((await call("PUT", "/c1", valid)).status, 403);
    assert.equal((await call("DELETE", "/c1")).status, 403);
    assert.equal((await call("PUT", "/c1/projects/p1", { role: "aannemer" })).status, 403);
    assert.equal((await call("DELETE", "/c1/projects/p1")).status, 403);
  });

  it("validates input for adults before touching anything", async () => {
    role = "adult";
    const response = await call("POST", "/", { name: "", emails: ["nope"] });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; fields?: Record<string, string[]> } };
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.fields?.name, "name error");
    assert.ok(body.error.fields?.["emails.0"], "email error");
    assert.equal((await call("PUT", "/c1/projects/p1", { role: "x".repeat(61) })).status, 400);
    assert.equal((await call("GET", "/?q=" + "x".repeat(101))).status, 400);
  });
});

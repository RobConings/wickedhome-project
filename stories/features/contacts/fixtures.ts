import type { Contact } from "@/features/contacts/types/contacts";
import type { Shop } from "@/features/shops/types/shops";

/** Fictional contacts (example.be addresses, made-up numbers) for the stories. */
const contact = (overrides: Partial<Contact> & Pick<Contact, "id" | "name">): Contact => ({
  company: null,
  trade: null,
  emails: [],
  phones: [],
  address: null,
  websiteUrl: null,
  notes: null,
  shop: null,
  projects: [],
  createdAt: "2026-09-12T09:30:00.000Z",
  updatedAt: "2026-10-01T14:05:00.000Z",
  ...overrides,
});

const bathroom = { id: "pr-bathroom", name: "Badkamer renovatie", color: "#3b82b6", running: true };
const garden = { id: "pr-garden", name: "Tuin aanleggen", color: "#5f7d3a", running: false };

export const contactFixtures = {
  peeters: contact({
    id: "c-peeters",
    name: "Jan Peeters",
    company: "Bouwbedrijf Peeters",
    trade: "aannemer",
    emails: ["jan@peeters.example.be", "offerte@peeters.example.be"],
    phones: ["+32 470 11 22 33", "011 22 33 44"],
    address: "Industrieweg 12, 3500 Hasselt",
    websiteUrl: "https://www.peeters.example.be",
    notes: "Komt meestal 's ochtends langs. Offerte badkamer gevraagd op 28/09/2026.",
    projects: [{ ...bathroom, role: "aannemer" }],
  }),
  water: contact({
    id: "c-water",
    name: "Waterwerken Janssens",
    trade: "loodgieter",
    emails: ["info@janssens.example.be"],
    phones: ["0478 98 76 54"],
    projects: [{ ...bathroom, role: "loodgieter" }],
  }),
  spark: contact({ id: "c-spark", name: "Els Vandenberghe", company: "Elektro Spark", trade: "elektricien", phones: ["0496 12 12 12"] }),
  green: contact({
    id: "c-green",
    name: "Groen & Zo",
    trade: "tuinaannemer",
    emails: ["hallo@groenenzo.example.be"],
    projects: [{ ...garden, role: "tuinaannemer" }],
  }),
  tiles: contact({
    id: "c-tiles",
    name: "Tegelhandel De Vloer",
    trade: "leverancier",
    emails: ["verkoop@devloer.example.be"],
    phones: ["089 55 66 77"],
    shop: { id: "s-tiles", name: "De Vloer" },
  }),
  bank: contact({ id: "c-bank", name: "Kantoor Hasselt-Centrum", company: "Voorbeeldbank", trade: "bank", phones: ["011 00 00 00"] }),
  school: contact({ id: "c-school", name: "Basisschool De Linde", trade: "school", emails: ["secretariaat@delinde.example.be"], phones: ["011 99 88 77"] }),
  noTrade: contact({
    id: "c-buur",
    name: "Marie-Christine Vanderlinden-Verhoeven",
    emails: ["marie-christine.vanderlinden-verhoeven@a-very-long-domain-name.example.be"],
  }),
};

export const contactListFixture: Contact[] = Object.values(contactFixtures);

export const contactSelectionsFixture = { favoriteIds: ["c-peeters", "c-school"], recentIds: ["c-water", "c-spark"] };

export const contactShopsFixture: Shop[] = [
  {
    id: "s-tiles",
    name: "De Vloer",
    type: "diy",
    address: "Steenweg 1, 3500 Hasselt",
    websiteUrl: null,
    hasWebshop: false,
    openingHours: null,
    notes: null,
    isBuiltIn: false,
    iconUrl: null,
    ingredientSearch: false,
  },
];

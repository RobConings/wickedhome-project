import type { Shop } from "@/features/shops/types/shops";

/**
 * Stand-in shop icons for stories: simple lettered tiles as data URLs (no network, no real brand artwork).
 * `transparent` draws only the letter, like many favicons, to check the white tile in dark mode.
 */
const fixtureIcon = (letter: string, color: string, { transparent = false, round = false } = {}) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${
      transparent ? "" : `<rect width="64" height="64" rx="${round ? 32 : 12}" fill="${color}"/>`
    }<text x="32" y="44" font-family="Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${
      transparent ? color : "#fff"
    }">${letter}</text></svg>`,
  )}`;

export const shopIconFixtures = {
  colruyt: fixtureIcon("C", "#e2001a"),
  delhaize: fixtureIcon("D", "#d6001c", { transparent: true }),
  aldi: fixtureIcon("A", "#00205b"),
  action: fixtureIcon("A", "#0071ce", { round: true }),
  gamma: fixtureIcon("G", "#003f8a"),
  ikea: fixtureIcon("I", "#0058a3"),
  bol: fixtureIcon("b", "#0000a4", { transparent: true }),
  coolblue: fixtureIcon("c", "#0090e3", { round: true }),
  /** A real image file served by Storybook from public/. */
  brand: "/brand/icon-192.png",
  /** A URL that fails to load: the logo falls back to the type icon. */
  broken: "/brand/does-not-exist.png",
};

const builtIn = (shop: Omit<Shop, "isBuiltIn" | "address" | "openingHours" | "notes" | "iconUrl" | "ingredientSearch"> & Partial<Shop>): Shop => ({
  address: null,
  openingHours: null,
  notes: null,
  iconUrl: null,
  ingredientSearch: false,
  ...shop,
  isBuiltIn: true,
});

/** A few real shops from the built-in Belgian catalogue, plus some a household added itself. */
export const shopFixtures = {
  colruyt: builtIn({
    id: "s-colruyt",
    name: "Colruyt",
    type: "supermarket",
    websiteUrl: "https://www.colruyt.be",
    hasWebshop: false,
    address: "Kortrijksesteenweg 1, 9000 Gent",
    openingHours: "Mon–Sat 8:30–20:00\nClosed on Sunday",
    notes: "Big weekly shop. Bring the crates.",
    iconUrl: shopIconFixtures.colruyt,
  }),
  delhaize: builtIn({
    id: "s-delhaize",
    name: "Delhaize",
    type: "supermarket",
    websiteUrl: "https://www.delhaize.be",
    hasWebshop: true,
    iconUrl: shopIconFixtures.delhaize,
    /** Searched by the assistant for recipe ingredients. */
    ingredientSearch: true,
  }),
  aldi: builtIn({ id: "s-aldi", name: "Aldi", type: "supermarket", websiteUrl: "https://www.aldi.be", hasWebshop: false, iconUrl: shopIconFixtures.aldi }),
  action: builtIn({
    id: "s-action",
    name: "Action",
    type: "discount",
    websiteUrl: "https://www.action.com/nl-be/",
    hasWebshop: false,
    iconUrl: shopIconFixtures.action,
  }),
  kruidvat: builtIn({ id: "s-kruidvat", name: "Kruidvat", type: "drugstore", websiteUrl: "https://www.kruidvat.be", hasWebshop: true }),
  gamma: builtIn({ id: "s-gamma", name: "Gamma", type: "diy", websiteUrl: "https://www.gamma.be", hasWebshop: true, iconUrl: shopIconFixtures.gamma }),
  brico: builtIn({ id: "s-brico", name: "Brico", type: "diy", websiteUrl: "https://www.brico.be", hasWebshop: true }),
  aveve: builtIn({ id: "s-aveve", name: "Aveve", type: "garden", websiteUrl: "https://www.aveve.be", hasWebshop: true }),
  ikea: builtIn({ id: "s-ikea", name: "IKEA", type: "home", websiteUrl: "https://www.ikea.com/be/nl/", hasWebshop: true, iconUrl: shopIconFixtures.ikea }),
  krefel: builtIn({ id: "s-krefel", name: "Krëfel", type: "electronics", websiteUrl: "https://www.krefel.be", hasWebshop: true }),
  tomAndCo: builtIn({ id: "s-tom-and-co", name: "Tom&Co", type: "pets", websiteUrl: "https://www.tomandco.be", hasWebshop: true }),
  bol: builtIn({ id: "s-bol", name: "bol", type: "online", websiteUrl: "https://www.bol.com/be/", hasWebshop: true, iconUrl: shopIconFixtures.bol }),
  coolblue: builtIn({
    id: "s-coolblue",
    name: "Coolblue",
    type: "online",
    websiteUrl: "https://www.coolblue.be",
    hasWebshop: true,
    iconUrl: shopIconFixtures.coolblue,
  }),
  bakery: {
    id: "s-bakery",
    name: "Bakkerij Van Damme",
    type: "other",
    address: "Dorpsstraat 12, 9830 Sint-Martens-Latem",
    websiteUrl: null,
    hasWebshop: false,
    openingHours: "Tue–Sun 7:00–13:00",
    notes: "Order the Sunday sandwiches before Friday.",
    isBuiltIn: false,
    iconUrl: null,
    ingredientSearch: false,
  },
  pharmacy: {
    id: "s-pharmacy",
    name: "Apotheek De Linde",
    type: "pharmacy",
    address: "Lindenlaan 3, 9000 Gent",
    websiteUrl: "https://www.apotheekdelinde.be",
    hasWebshop: false,
    openingHours: null,
    notes: null,
    isBuiltIn: false,
    /** Its website's icon fails to load: shows the type icon. */
    iconUrl: shopIconFixtures.broken,
    ingredientSearch: false,
  },
} satisfies Record<string, Shop>;

export const shopListFixture: Shop[] = Object.values(shopFixtures).sort((a, b) => a.name.localeCompare(b.name));

export const shopSelectionsFixture = {
  favoriteIds: [shopFixtures.colruyt.id, shopFixtures.gamma.id],
  recentIds: [shopFixtures.bol.id, shopFixtures.kruidvat.id, shopFixtures.colruyt.id, shopFixtures.ikea.id],
};

import type { Product } from "@/features/shopping/types/shopping";
import type {
  CookingIngredient,
  CookingState,
  CookUsage,
  IngredientCheck,
  IngredientProduct,
  MealPlanEntry,
  Recipe,
  RecipeCheck,
  RecipeIngredient,
  RecipeStep,
  RecipeSummary,
} from "@/features/recipes/types/recipes";
import { compareNeed, toStockUnits } from "@/types/units";
import { productFixtures, productListFixture, shopListFixture } from "../shopping/fixtures";

/**
 * Recipes, "To cook" and a cooking session for the stories (made-up data). Amounts are the recipe's own (500 g,
 * 2 pcs, 2 el); checks and cooking lines are computed with the real `compareNeed`, so the stories show the unit
 * states: converted (300 g against 200 g packs), counted (2 pcs), and unknown amount (2 el).
 */

const extraProduct = (id: string, name: string, category: Product["category"], unit: string | null, extra: Partial<Product> = {}): Product => ({
  ...productFixtures.pasta,
  id,
  name,
  category,
  unit,
  barcode: null,
  qrCode: null,
  imageUrl: null,
  packageAmount: null,
  packageUnit: null,
  shopLinks: [],
  ...extra,
});

const colruytLink = (url: string) => ({ ...productFixtures.coffee.shopLinks[0]!, id: `pl-${url}`, url });

export const recipeProductFixtures = {
  pasta: { ...productFixtures.pasta, packageAmount: 500, packageUnit: "g", shopLinks: [colruytLink("https://www.example.be/spaghetti")] },
  mince: extraProduct("pr-mince", "Rundergehakt", "meat_fish", "pack", { packageAmount: 500, packageUnit: "g" }),
  onion: extraProduct("pr-onion", "Uien", "produce", "pcs"),
  tomatoes: extraProduct("pr-tomatoes", "Tomatenblokjes", "pantry", "can", { packageAmount: 400, packageUnit: "g" }),
  oil: extraProduct("pr-oil", "Olijfolie extra vierge", "pantry", "fles", { packageAmount: 1, packageUnit: "l" }),
  cheese: extraProduct("pr-cheese", "BONI franse emmental geraspt 200 g", "dairy", "pak", {
    packageAmount: 200,
    packageUnit: "g",
    shopLinks: [colruytLink("https://www.example.be/emmental")],
  }),
  garlic: extraProduct("pr-garlic", "Look", "produce", "pcs"),
};

export const recipeProductsFixture: Product[] = [
  ...productListFixture.filter((product) => product.id !== productFixtures.pasta.id),
  ...Object.values(recipeProductFixtures),
].sort((a, b) => a.name.localeCompare(b.name));
export const recipeShopsFixture = shopListFixture;

const refOf = (product: Product): IngredientProduct => ({
  id: product.id,
  name: product.name,
  imageUrl: product.imageUrl,
  shopLink: product.shopLinks[0]?.url ? { url: product.shopLinks[0].url, shopName: product.shopLinks[0].shop.name } : null,
  unit: product.unit,
  packageAmount: product.packageAmount,
  packageUnit: product.packageUnit,
});

const ingredient = (
  position: number,
  overrides: Omit<Partial<RecipeIngredient>, "product"> & Pick<RecipeIngredient, "id" | "name"> & { from?: Product },
): RecipeIngredient => {
  const { from, ...rest } = overrides;
  return {
    position,
    productId: from?.id ?? null,
    productName: from?.name ?? null,
    product: from ? refOf(from) : null,
    quantity: null,
    unit: null,
    note: null,
    optional: false,
    ...rest,
  };
};

const p = recipeProductFixtures;
const ingredients: RecipeIngredient[] = [
  ingredient(0, { id: "ri-pasta", name: "Spaghetti", from: p.pasta, quantity: 500, unit: "g" }),
  ingredient(1, { id: "ri-mince", name: "Gehakt", from: p.mince, quantity: 500, unit: "g" }),
  ingredient(2, { id: "ri-onion", name: "Ui", from: p.onion, quantity: 2, unit: "pcs", note: "fijngesnipperd" }),
  ingredient(3, { id: "ri-tomatoes", name: "Tomatenblokjes", from: p.tomatoes, quantity: 2, unit: "blik" }),
  ingredient(4, { id: "ri-oil", name: "Olijfolie", from: p.oil, quantity: 2, unit: "el" }),
  ingredient(5, { id: "ri-cheese", name: "Emmentaler", from: p.cheese, quantity: 300, unit: "g", note: "geraspt" }),
  ingredient(6, { id: "ri-basil", name: "Verse basilicum", note: "een handvol", optional: true }),
];

/** Stock in stock units: spaghetti 3 packs, mince none, onions 5, tomatoes 1 can, oil 1 bottle, cheese 1 pack. */
const STOCK: Record<string, number> = { "pr-pasta": 3, "pr-mince": 0, "pr-onion": 5, "pr-tomatoes": 1, "pr-oil": 1, "pr-cheese": 1 };
const ON_LIST = new Set(["ri-tomatoes"]);

const steps: RecipeStep[] = [
  {
    id: "rs-1",
    position: 0,
    text: "Snipper de ui en fruit hem glazig in een scheut olijfolie.",
    timerMinutes: null,
  },
  {
    id: "rs-2",
    position: 1,
    text: "Voeg het gehakt toe en bak het rul, ongeveer 8 min.",
    timerMinutes: 8,
  },
  {
    id: "rs-3",
    position: 2,
    text: "Doe de tomatenblokjes erbij en laat de saus 20 minuten zachtjes pruttelen.",
    timerMinutes: 20,
  },
  {
    id: "rs-4",
    position: 3,
    text: "Kook intussen de spaghetti beetgaar volgens de verpakking.",
    timerMinutes: 10,
  },
  {
    id: "rs-5",
    position: 4,
    text: "Serveer met basilicum en Parmezaan.",
    timerMinutes: null,
  },
];

export const recipeFixture: Recipe = {
  id: "r-spaghetti",
  name: "Spaghetti bolognese",
  category: null,
  servings: 4,
  sourceUrl: "https://recepten.example.be/spaghetti-bolognese",
  imageUrl: null,
  coverFileId: null,
  notes: "De kinderen eten het liefst zonder basilicum.",
  ingredientCount: ingredients.length,
  stepCount: steps.length,
  ingredientNames: ingredients.map((item) => item.name),
  ingredients,
  steps,
  createdAt: "2026-10-01T17:30:00.000Z",
  updatedAt: "2026-10-08T18:05:00.000Z",
};

const summary = (overrides: Partial<RecipeSummary> & Pick<RecipeSummary, "id" | "name">): RecipeSummary => ({
  category: null,
  servings: 4,
  sourceUrl: null,
  imageUrl: null,
  coverFileId: null,
  ingredientCount: 6,
  stepCount: 4,
  ingredientNames: [],
  updatedAt: "2026-10-05T12:00:00.000Z",
  ...overrides,
});

export const recipeListFixture: RecipeSummary[] = [
  summary({
    id: "r-curry",
    name: "Kip curry met rijst",
    ingredientNames: ["Kipfilet", "Rijst", "Kokosmelk", "Currypasta"],
  }),
  summary({
    id: "r-steak",
    name: "Steak met frietjes",
    servings: 2,
    ingredientCount: 4,
    stepCount: 3,
    ingredientNames: ["Steak", "Frieten", "Sla"],
  }),
  summary({
    id: recipeFixture.id,
    name: recipeFixture.name,
    sourceUrl: recipeFixture.sourceUrl,
    ingredientCount: 6,
    stepCount: 5,
    ingredientNames: recipeFixture.ingredientNames,
  }),
  summary({
    id: "r-soup",
    name: "Tomatensoep met balletjes",
    servings: null,
    ingredientCount: 7,
    stepCount: 0,
    ingredientNames: ["Tomaten", "Gehakt", "Bouillon"],
  }),
];

export const recipeSelectionsFixture = {
  favoriteIds: [recipeFixture.id],
  recentIds: [],
};

/** The check for `servings`, computed like the API does. */
function checkFor(servings: number): RecipeCheck {
  const scale = servings / 4;
  return {
    recipeId: recipeFixture.id,
    servings,
    ingredients: ingredients.map((item): IngredientCheck => {
      const stock = item.productId ? (STOCK[item.productId] ?? null) : null;
      const need = compareNeed({ quantity: item.quantity, unit: item.unit }, scale, stock, item.product);
      return {
        ingredientId: item.id,
        name: item.name,
        productId: item.productId,
        productName: item.productName,
        product: item.product,
        note: item.note,
        optional: item.optional,
        needed: need.needed,
        unit: item.unit,
        stock,
        comparable: need.comparable,
        neededInStockUnits: need.neededInStockUnits,
        stockInRecipeUnit: need.stockInRecipeUnit,
        shortfall: need.shortfall,
        shortfallPackages: need.shortfallPackages,
        status: need.status,
        onList: ON_LIST.has(item.id),
      };
    }),
  };
}

export const recipeCheckFixture: RecipeCheck = checkFor(4);

/** Scales the fixture's needs for another number of people (stories have no API). */
export async function fakeCheck(_recipeId: string, servings: number): Promise<RecipeCheck> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return checkFor(servings);
}
export const stalledCheck = () => new Promise<never>(() => undefined);
export const failedCheck = async (): Promise<RecipeCheck> => {
  throw new Error("offline");
};

const entry = (overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, "id" | "recipeId" | "recipeName">): MealPlanEntry => ({
  imageUrl: null,
  coverFileId: null,
  servings: 4,
  status: "open",
  currentStep: 0,
  stepCount: 5,
  addedByName: "Sofie",
  createdAt: "2026-10-07T09:00:00.000Z",
  startedAt: null,
  cookedAt: null,
  openItemCount: 0,
  ...overrides,
});

export const mealPlanFixtures = {
  cooking: entry({
    id: "mp-spaghetti",
    recipeId: recipeFixture.id,
    recipeName: recipeFixture.name,
    status: "cooking",
    currentStep: 1,
    startedAt: "2026-10-09T17:10:00.000Z",
  }),
  open: entry({
    id: "mp-curry",
    recipeId: "r-curry",
    recipeName: "Kip curry met rijst",
    openItemCount: 3,
    stepCount: 4,
  }),
  steak: entry({
    id: "mp-steak",
    recipeId: "r-steak",
    recipeName: "Steak met frietjes",
    servings: 2,
    addedByName: null,
    stepCount: 3,
  }),
  cooked: entry({
    id: "mp-soup",
    recipeId: "r-soup",
    recipeName: "Tomatensoep met balletjes",
    status: "cooked",
    stepCount: 0,
    cookedAt: "2026-10-06T18:45:00.000Z",
  }),
};
export const mealPlanFixture: MealPlanEntry[] = Object.values(mealPlanFixtures);

/** A cooking line, computed like the API does; `used` in stock units. */
function cookingItem(item: RecipeIngredient, used = 0, lastUsageId: string | null = null): CookingIngredient {
  const stock = item.productId ? (STOCK[item.productId] ?? null) : null;
  const need = item.quantity === null ? null : compareNeed({ quantity: item.quantity, unit: item.unit }, 1, stock, item.product);
  const per = item.product ? toStockUnits(1, item.unit, item.product) : null;
  return {
    kind: "ingredient",
    id: item.id,
    name: item.name,
    productId: item.productId,
    product: item.product,
    needed: need?.needed ?? null,
    unit: item.unit,
    note: item.note,
    optional: item.optional,
    comparable: !item.product || item.quantity === null || per !== null,
    neededInStockUnits: need?.neededInStockUnits ?? null,
    tapAmount: !item.product ? (need?.needed ?? 1) : item.quantity === null ? 1 : (need?.neededInStockUnits ?? null),
    used,
    usedInRecipeUnit: per ? Math.round((used / per) * 1000) / 1000 : null,
    stock: stock === null ? null : Math.max(0, stock - used),
    lastUsageId,
  };
}

const [pastaLine, minceLine, onionLine, tomatoLine, oilLine, cheeseLine, basilLine] = ingredients;

export const cookingIngredientFixtures = {
  pasta: cookingItem(pastaLine!),
  mince: cookingItem(minceLine!),
  onion: cookingItem(onionLine!, 2, "u-onion"),
  tomatoes: cookingItem(tomatoLine!),
  /** "2 el" doesn't convert to bottles: "Used" asks how much. */
  oil: cookingItem(oilLine!),
  /** 300 g = 1.5 packs of 200 g; 1 pack used so far. */
  cheese: cookingItem(cheeseLine!, 1, "u-cheese"),
  basil: cookingItem(basilLine!),
  garlic: { ...cookingItem(ingredient(9, { id: "x-garlic", name: "Look", from: p.garlic, quantity: 1, unit: "pcs" }), 1, "u-garlic"), kind: "extra" as const },
};

const usage = (overrides: Partial<CookUsage> & Pick<CookUsage, "id" | "name" | "quantity">): CookUsage => ({
  kind: "ingredient",
  refId: null,
  unit: null,
  recipeQuantity: null,
  deducted: overrides.quantity,
  undone: false,
  createdAt: "2026-10-09T17:20:00.000Z",
  ...overrides,
});

export const cookingStateFixture: CookingState = {
  entry: mealPlanFixtures.cooking,
  recipe: { id: recipeFixture.id, name: recipeFixture.name, servings: 4, coverFileId: null, steps },
  ingredients: [
    cookingIngredientFixtures.pasta,
    cookingIngredientFixtures.mince,
    cookingIngredientFixtures.onion,
    cookingIngredientFixtures.tomatoes,
    cookingIngredientFixtures.oil,
    cookingIngredientFixtures.cheese,
    cookingIngredientFixtures.basil,
  ],
  extras: [cookingIngredientFixtures.garlic],
  usages: [
    usage({ id: "u-garlic", kind: "extra", refId: "x-garlic", name: "Look", quantity: 1, unit: "pcs", createdAt: "2026-10-09T17:25:00.000Z" }),
    usage({ id: "u-cheese", refId: "ri-cheese", name: "Emmentaler", quantity: 1, unit: "pak", recipeQuantity: { amount: 200, unit: "g" } }),
    usage({ id: "u-onion", refId: "ri-onion", name: "Ui", quantity: 2, unit: "pcs", createdAt: "2026-10-09T17:12:00.000Z" }),
    usage({ id: "u-pasta-undone", refId: "ri-pasta", name: "Spaghetti", quantity: 1, unit: "pack", undone: true, createdAt: "2026-10-09T17:11:00.000Z" }),
  ],
};

export const cookedStateFixture: CookingState = {
  ...cookingStateFixture,
  entry: { ...mealPlanFixtures.cooking, status: "cooked", cookedAt: "2026-10-09T18:05:00.000Z", currentStep: 4 },
};

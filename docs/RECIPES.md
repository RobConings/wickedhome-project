# Recipes — "To cook", stock check and flexible cooking

People shop by meal ("this week: spaghetti, steak, curry"). A **recipe** is a list of ingredients linked to the
household's products, plus steps. Putting it on **To cook** checks the stock and adds only what's missing to
the shopping list. **Cooking** is flexible: nothing is taken from stock for the whole recipe; the cook taps
what she actually used, can add extra ingredients, and "Done cooking" only marks the meal made.

Files: `prisma/schema/recipes.prisma`, `src/api/recipes/recipes.{routes,service,test}.ts`,
`src/features/recipes/**`, `src/routes/recipes.tsx`, `recipe-detail.tsx`, `recipe-cooking.tsx`,
`stories/features/recipes/**`.

## Model

| Model                 | What it is                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Recipe`              | Name, `servings?` (amounts are for this many people; null = use as they are), `sourceUrl?`, `imageUrl?` (original source photo), `coverFileId?` (an attached image, like a project cover), `notes?` |
| `RecipeIngredient` | `position`, `productId?` (SetNull), `name`, `quantity?` + `unit?` = **the recipe's own amount** for its servings (300 g, 2 pcs, 2 el), `note?` ("geraspt"), `optional` |
| `RecipeStep`          | `position`, `text`, `timerMinutes?`. Pasted instructions are split per numbered line or paragraph (`splitInstructions`); "10 min" in a step gives it a timer (`timerFromText`) |
| `MealPlanEntry`       | A meal on To cook **and** its cooking session: `servings`, `status OPEN → COOKING → COOKED`, `currentStep`, `startedAt?`, `cookedAt?`, `addedByUserId?`                        |
| `CookExtraIngredient` | Added while cooking, not in the recipe (`productId?`, `name`, `quantity?`, `unit?`, `savedToRecipe`)                                                                           |
| `CookUsage`           | One "Used" tap: `ingredientId` or `extraId`, `quantity`, the stock `movementId` it caused (null when nothing could be taken), `undoneAt?`                                      |

Shared changes: `ShoppingItemSource` + `RECIPE` and a soft `ShoppingItem.mealPlanEntryId` (the "For Spaghetti"
badge); `StockMovementReason` + `COOKED` and a soft `StockMovement.mealPlanEntryId`. Migration `recipes`.

Recipe tiles, list thumbnails, To cook cards and the detail page show `coverFileId` first, then `imageUrl`.
`recipes_read_link` returns the original `Recipe.image` (string, array or ImageObject), falling back to
`og:image`, including on pages without structured recipes. Relative URLs resolve against the final page URL;
only HTTP(S) URLs up to 2,000 characters are accepted. Pass this `imageUrl` to `recipes_save`;
`recipes_list` returns it for both summaries and details. Omitting it on an edit preserves the photo, while
null removes the source photo. Migration: `recipe_image_url`.

After applying the migration, run `npx tsx --env-file=.env scripts/backfill-recipe-images.ts --dry-run`,
then the same command without `--dry-run`. It reads each `sourceUrl` using the existing guarded page reader,
fills only missing photos (no uploaded cover), and rechecks the source and missing cover at write time.
Only `imageUrl` changes: recipe fields, timestamps, ingredients and steps remain untouched. Failed sources
are reported and do not stop the remaining recipes; rerunning skips photos already filled.

## Recipe categories

Each household manages its own `RecipeCategory` records (name and normalized `nameKey`, unique per
household). A recipe has one optional `categoryId`; existing recipes start uncategorized. Category names
ignore differences in case, accents and repeated spaces for duplicate detection.

The overview's **Manage categories** dialog creates, renames and deletes categories. The recipe form assigns
or clears the category; cards show its name and the detail page links to its filtered list. The overview's
category filter uses `?tab=all&category=<id>` (`none` for uncategorized), combines with search and favourites,
and survives reloading. Everyone reads; only adults and owners manage categories or assign them.

- `GET /api/recipes/categories` returns `{ id, name, recipeCount }` per category.
- `POST /api/recipes/categories { name }`, `PUT /api/recipes/categories/:id { name }`, and
  `DELETE /api/recipes/categories/:id` manage categories within the current household.
- Recipe create/update accepts `categoryId`; omission preserves it on updates and null clears it.
  Recipe list/detail return `category: { id, name } | null`. `GET /api/recipes?categoryId=<id>` filters at
  the API as well (`categoryId=none` selects uncategorized).
- MCP: `recipes_categories`, `recipes_save_category`, `recipes_delete_category`; `recipes_save` accepts
  `category` or `noCategory`, and `recipes_list` accepts `category` or `uncategorized`. Category references
  resolve by name within the household. All writes retain the existing confirmation and role rules.

Migration `recipe_categories` adds the table and nullable foreign key. Deleting a category clears only that
reference through `ON DELETE SET NULL`; the recipes, images, ingredients, steps and timestamps are retained.
`npx tsx scripts/recipe-categories-runtime-check.ts` verifies the services and MCP against a temporary
database populated with the app's schema and drops it afterwards.

## Bulk import over MCP

Use `recipes_import_batch` for imports instead of saving every recipe separately. Each call accepts
1–25 recipes and an optional batch `category` (name or id); an item's `category` overrides it. New recipes
need a name and accept servings, the original `imageUrl`, ingredient amounts/units/notes (optionally linked
to a known household `product`), steps as `{ text, timerMinutes? }`, and recipe notes. Read source pages
with `recipes_read_link` first; the batch itself does not fetch websites or invent missing recipe data.

```json
{
  "name": "recipes_import_batch",
  "arguments": {
    "confirm": true,
    "category": "Pasta",
    "recipes": [
      {
        "sourceUrl": "https://recipes.example/spaghetti",
        "name": "Spaghetti",
        "imageUrl": "https://images.example/spaghetti.jpg",
        "servings": 4,
        "ingredients": [{ "name": "Spaghetti", "quantity": 400, "unit": "g" }],
        "steps": [{ "text": "Kook de pasta.", "timerMinutes": 10 }]
      },
      { "sourceUrl": "https://recipes.example/existing-pasta" }
    ]
  }
}
```

Source URL matches are household-scoped. Matching ignores fragments, tracking (`utm_*`, `fbclid`, `gclid`),
query order and trailing slashes; it preserves meaningful query parameters, path case and protocol.
Existing recipes only receive the specified category, including when content was included in the request.
Omitting the category leaves it unchanged. No other columns, timestamps, ingredient ids or step ids change.
For legacy duplicates the oldest matching recipe is selected and `existingDuplicates` reports the others;
no existing rows are deleted or merged.

The response contains `created`, `categorized`, `unchanged` and an indexed result with id/name/status for
each input item. A batch is atomic: invalid new rows/categories/products roll the whole batch back. Repeating
a successful batch is safe. PostgreSQL transaction locks serialize imports for a household, preventing
duplicates from overlapping retries. Cancellation before commit also rolls the batch back.

MCP allows **240 requests per minute per person**, shared across that person's refreshed tokens, and
**4 simultaneous tool calls** per person. Other people sharing an IP keep separate request budgets;
failed authentication retains its separate 30-attempt/15-minute IP limit. HTTP 429 returns a JSON-RPC error
with `data.retryAfterSeconds` and the same positive delay in the `Retry-After` header. Wait that many seconds
before retrying. Concurrency exhaustion uses a 1-second retry delay. MCP bodies may be up to **2 MB**;
HTTP 413 asks for a smaller batch. JSON-RPC request arrays remain unsupported; use the batch tool instead.

`npx tsx scripts/recipe-import-runtime-check.ts` exercises the real services and MCP against a temporary
database, including concurrency, retry deduplication, rollback, household/role isolation and preservation
of existing content. No schema migration is needed for batch import.

## Units

An ingredient's amount is the recipe's own (imported recipes are in grams); stock is counted in the product's
stock unit (packs). They meet through the product's **content per package** (`Product.packageAmount` +
`packageUnit`, e.g. 200 g; a "6 x 33 cl" multipack is 198 cl; migration `product_package_size`). Pure helpers in
`src/types/units.ts` (`units.test.ts`): `unitInfo` (mass mg/g/gr/kg, volume ml/cl/dl/l/liter, count: empty, pcs,
st, stuk(s), pack, pak, pakje, blik, fles…; Dutch and English, case and a dot ignored), `toStockUnits` and
`compareNeed(ingredient, scale, stock, product)` → `{ needed, neededInStockUnits, stockInRecipeUnit, shortfall,
shortfallPackages, comparable, status }`:

- a count unit against stock in things: compared directly (old recipes whose quantity was packs keep working);
- mass/volume against a product counted in the same dimension (grams): converted directly;
- mass/volume against packs with a package size of that dimension: stock × size; packs to buy = ceil(short / size)
  (300 g against 1 pack of 200 g: short 100 g, buy 1);
- anything else (el, tl, teentje, or no package size): `unknown_amount`. No shortage or stock is ever shown in
  the wrong unit; the UI shows a neutral ring and "Set the content per package" (a link to the product).

Count units round up to whole things after scaling. Stock is always shown in its own unit with the content
("1 pak (200 g) in stock"); the check says "Needs 300 g · have 200 g → buy 1 pak". The product form has
"Content per package" (number + g/kg/ml/cl/l/pcs); a barcode lookup fills it (amount × count).
`scripts/backfill-package-sizes.ts` (idempotent, `--dry-run` first) filled missing sizes from product names
("BONI franse emmental geraspt 200 g" → 200 g) and never overwrites a set size.

## Stock check and To cook

- `GET /api/recipes/:id/check?servings=` → per ingredient: `needed` (recipe unit) for these servings, `stock`
  (the total shared stock of the product's group in its stock unit, see
  [INVENTORY.md](INVENTORY.md#alternatives-shared-stock)), the `compareNeed` fields (`stockInRecipeUnit`,
  `shortfall`, `shortfallPackages`, `comparable`), `status` (`in_stock` / `short` / `not_kept` /
  `unknown_amount` / `unknown`: no product), the linked `product` (page, webshop link, photo, unit, package size)
  and `onList` (an open item for any product of the group, or the same free-text name).
- `POST /api/recipes/meal-plan { recipeId, servings, items: [{ ingredientId, quantity? }] }` creates the entry
  and adds the chosen items (a product in its stock unit, **whole packages**: the packs to buy, or 1 when the units
  don't convert; a free-text ingredient with the recipe's amount) with `addRecipeItem` (shopping service): an open item of the same product group gets
  **more quantity** instead of a second line; an ingredient without a product becomes a free-text item (reused
  by name). New items land on the everyday groceries list (the default list for `manual`, not a second "Groceries"), with source `recipe` and `mealPlanEntryId`.
- `DELETE /api/recipes/meal-plan/:id?removeItems=1` takes it off the list, optionally with its own open items
  (quantity merged into an existing item is not taken back).

The recipe page's **check dialog** shows this per ingredient with a servings stepper; missing ones (not optional,
not on a list yet) are ticked to buy. The ingredients list on the page shows the same stock dot (the check is
loaded un-awaited). A linked product shows its photo, its name as a link to its page and a webshop icon (the
default shop's link, else the first), on the recipe page, in the check dialog and in the cooking view.

## Cooking (flexible)

The cooking view (`/recipes/cook/:entryId`) is a bespoke component, phone-first: one large step at a time
(Previous / Next, swipe), a timer per step, the screen kept on with the Wake Lock API where supported, and the
ingredients in a tray (bottom sheet on phones, side column from `lg`). Ingredients the current step mentions
come first (`sortForStep`).

- **Used** (`POST /meal-plan/:id/use { ingredientId | extraId | productId, quantity, unit? }`): `quantity` is in
  the product's stock unit, or in `unit` ("g"), converted and refused when it doesn't convert. One tap takes the
  need converted to packs (300 g = 1.5 packs of 200 g); when the recipe's unit doesn't convert, the tap opens the
  amount control in the stock unit instead. Taps (`CookUsage.quantity`) are stored in stock units and shown in both
  ("used 1,5 pak (300 g) of 300 g"). Takes the amount out of
  the shared stock with `useStockForCooking` (inventory) → `applyChange`, reason `cooked`, linked to the meal;
  low stock goes on the shopping list as with every change. One tap takes the planned amount (or 1); "…" gives
  − / + and a custom amount; it can be tapped again ("1 more garlic"). A `productId` that isn't an ingredient
  (no ingredient of the same product group) becomes an extra. With several places, the place that covers the
  amount with the least left over is used, else the fullest. An ingredient without a product, or a product not
  kept in stock, is recorded without touching stock.
- **Undo** (`DELETE /meal-plan/:id/use/:usageId`): a correcting `cooked` movement puts back what the tap took;
  the tap gets `undoneAt` (undoing twice does nothing). Each tap toasts with "Undo"; the row has an undo for its
  last tap.
- **+ Ingredient** (`POST /meal-plan/:id/extras { productId? | name, quantity?, unit?, use, saveToRecipe }`):
  `use` records it as used at once; `saveToRecipe` (owners/adults) also adds it to the recipe (amount scaled
  back to the recipe's servings) and from then on it shows as a recipe ingredient.
- **Step** (`PUT /meal-plan/:id/step { step }`): remembered so another device or the assistant knows where she
  is. The page doesn't reload for it (`cookingShouldRevalidate`).
- **Done** (`POST /meal-plan/:id/cooked`): sets COOKED with a summary of what was used. Nothing more is deducted.
- **Start**: `POST /meal-plan/:id/start` (from To cook), or `POST /api/recipes/:id/cook { servings? }` from the
  recipe page (continues the meal being cooked, else the oldest waiting one, else creates one on the fly).

## Roles

Everyone reads. Owners and adults create, edit and delete recipes, set the cover, plan meals and take them off
the list (`canManageRecipes`). **Children may cook** (like scanning stock): start, use, undo, extras (not saved
to the recipe), step and done (`canCook`). Another household's recipe, meal or product is a 404.

## Service functions (for the assistant, src/api/recipes/recipes.service.ts)

| Function                                                                                                                                             | What it does                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `listRecipes(householdId, { q? })`                                                                                                                   | Summaries by name; `q` matches name and ingredients               |
| `getRecipe(householdId, id)`                                                                                                                         | Recipe with ingredients and steps                                 |
| `createRecipe(user, input: RecipeInput)` / `updateRecipe(householdId, id, input)`                                                                    | Save with ingredients (keep `id` to keep an ingredient) and steps |
| `deleteRecipe(householdId, id)`, `setRecipeCover(householdId, id, { fileId })`                                                                       |                                                                   |
| `checkRecipe(householdId, id, servings?)`                                                                                                            | The stock check above                                             |
| `listMealPlan(householdId, { cooked? })`, `listCookingEntries(householdId)`                                                                          | To cook; the meals being cooked now                               |
| `planRecipe(user, { recipeId, servings, items })`                                                                                                    | To cook + missing items → `{ entry, added, merged }`              |
| `deleteMealPlanEntry(householdId, id, { removeItems? })`                                                                                             |                                                                   |
| `startCooking(user, entryId)`, `cookRecipe(user, recipeId, { servings? })`                                                                           | → `CookingState`                                                  |
| `getCookingState(householdId, entryId)`                                                                                                              | Steps, ingredients and extras with needed / used / stock, taps    |
| `useIngredient(user, entryId, { ingredientId \| extraId \| productId, quantity, unit? })`                                                                   | → `{ state, usageId, addedToShoppingList }`                       |
| `undoUsage(user, entryId, usageId)`, `addExtra(user, entryId, input)`, `setStep(householdId, entryId, { step })`, `markCooked(householdId, entryId)` | → `CookingState`                                                  |

`user` is a `SessionUser` (`id`, `householdId`, `locale`, `role`). Pure helpers in
`src/features/recipes/types/recipes.ts`: `needsFor`, `servingsScale`, `splitInstructions`, `timerFromText`,
`sortForStep`, `stepMentions`.

## Screen context

Route files declare `handle.screen`: `recipes` (overview, kind only), `recipe` (id + name) and `cooking`
(entry id + recipe name). The assistant's recipes skill registers the three kinds: on the cooking screen the
model gets the recipe, servings, the current step and every ingredient's used/needed amount.

## Assistant (ai/skills/recipes)

- **From a link**: `recipes_read_link` reads the page's schema.org `Recipe` data (name, servings, ingredient
  lines, steps; src/api/web/web-extract.ts), or the page text when there is none. Needs web search (`SEARCH_URL`).
  Some sites cut the JSON-LD steps off (2 teaser steps pointing at a "cooking mode"). When there are few steps for
  many ingredients (< 4 for ≥ 8), or the page has more, `completeRecipeSteps` takes the longest plausible list
  from the page: an instruction list (microdata, repeated `data-testid`/class "instruction/step/bereiding" items,
  an `<ol>` in such a container), embedded data (`__NEXT_DATA__`, Next.js flight chunks with `{"step": n,
  "description": …}`), or the text under "Bereiding". `stepsSource: "page"` / `stepsIncomplete` tell the model to
  say so honestly. `recipes_save` on an existing recipe with `steps` replaces them (re-reading a link).
- **From pasted text or a photo**: the chat model reads it itself (no model call inside a tool). A photo needs a
  word like "recept" in the question to route here (ai/docs/ASSISTANT.md, known gaps).
- `recipes_match`: per ingredient the best household product (a group of alternatives counts as its main
  product, with the shared stock), the shortfall, and `unknown` where there is no product.
  `recipes_save` (list preview) saves a new recipe or merges ingredients into an existing one (same name =
  updated, e.g. a product linked later).
- **Unknown ingredients**: `recipes_find_product` searches only the webshops switched on for ingredient search
  (below), reading name, price, link and photo from the product pages. Each find is remembered server-side as an
  **offer** (`ai/skills/recipes/offers.ts`, per household, 2 hours) and returned as an `offer` id. Passing it to
  `inventory_save_product` or to an ingredient of `recipes_save` copies the link and price (`upsertProductLink`),
  photo and package size onto the product (`offer-products.ts`), so the model can't drop or garble them. The
  confirmation card shows the link and price.
- `recipes_list` (recipes, To cook, one recipe with its stock check), `recipes_plan` (To cook + missing items,
  list preview of what goes on the list).
- Cooking: `recipes_use` ("ik heb nog 1 look extra gebruikt"; a product not in the recipe becomes an extra),
  `recipes_add_ingredient`, `recipes_step` (current and next step, read only), `recipes_go_to_step`,
  `recipes_done`. Children may use all cooking tools (not `saveToRecipe`). The meal defaults to the cooking
  screen's, else the one being cooked of the recipe on screen, else the only one being cooked; otherwise the
  assistant asks.

## Shops for ingredient search

Per shop and per household (also for built-in catalogue shops, which have no household): "Use for ingredient
search" (`HouseholdShopSetting.ingredientSearch`, migration `shop_ingredient_search`). It can only be on for a
shop with a webshop and a website (`canSearchIngredients`); owners and adults switch it
(`PUT /api/shops/:id/ingredient-search { enabled }`, or the switch in the shop form). The shop's page shows
the switch in its Website card (applies at once), the Shops list an "Ingredients" marker.
`listIngredientSearchShops(householdId)` (src/api/shops/shops.service.ts) gives the assistant their domains.

## Not in scope / known gaps

- Nutrition; a dated meal calendar; webshop ordering. Spoon units (el, tl) and pieces against grams aren't
  converted (no densities or piece weights).
- Merged shopping quantities aren't taken back when a meal is removed; only the items it created are.
- Steps are edited as one text (split on save); a step's timer comes from its text.

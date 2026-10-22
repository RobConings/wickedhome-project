# Inventory — scanning and barcode auto-fill

Stock is "product P at place X" (`StockItem`, `src/api/inventory`); products are the household's
catalogue, owned by the shopping feature (`Product` in `prisma/schema/shopping.prisma`) and shared by
shopping lists, staples and stock. The scan screen (`/inventory/scan`) finds a product by its barcode or
own QR label and uses, adds or shows its stock.

## Content per package and the webshop link

- **Content per package** (`Product.packageAmount` + `packageUnit`: g, kg, ml, cl, l, pcs): what one stock package
  holds (a 6 x 33 cl pack is 198 cl). Recipes compare gram/litre amounts with stock in packs through it
  ([RECIPES.md](RECIPES.md#units)). The product form edits it; a barcode lookup fills it (amount × count);
  `inventory_save_product` takes it. Missing sizes were filled once from product names by
  `scripts/backfill-package-sizes.ts` (idempotent, `--dry-run` first, never overwrites).
- **Webshop link** in the product form: one main link (the default shop's, else the first) with an optional
  price. A pasted URL is read with the link preview (`POST /api/shopping/link-preview`), which offers to fill the
  empty name, photo and price. The URL's domain picks the shop (`shopForUrl` / `linkShopFor`,
  `src/features/shopping/types/shop-links.ts`, catalogue shops included). A known shop becomes the default shop
  when none is set; a different default shop stays, and the link is saved for the URL's shop. An unknown domain
  saves the link for the default shop, and without one the form asks which shop. It is saved in the same submit
  (`handleProductForm`: the product, then `upsertProductLink`). Clearing the field warns first and removes that
  shop's link. Other shops' links stay in the product's link menu (the hint counts them).

## Alternatives (shared stock)

Several products can be the same thing for the stock: two brands of bacon, a webshop's own brand. They
share **one stock**. A group has one **main product** (`Product.stockProductId` null) and **alternatives**
that point at it (`stockProductId` → main). Only the main product has `StockItem`s, so `StockItem` and its
`@@unique([productId, placeId])` are unchanged. The main product may be a generic product without a barcode
("Bacon"): the link dialog's optional "Name for the shared stock" creates it. Pure rules and tests:
`src/api/shopping/product-alternatives.ts(.test.ts)`; database work in `shopping.service.ts`.

- **Link** (`PUT /api/shopping/products/:id/alternative` `{ mainProductId, newMainName? }`, owner/adult):
  `id` joins the group of `mainProductId` (its main product when the chosen one is an alternative). In one
  transaction, a main product's stock merges into the new main product's **per place**: quantities summed,
  the higher minimum and the earliest expiry kept; its movements move along and a `manual_correction`
  "Merged from X" is logged (±0 when the stock only moved to a place the main product wasn't kept yet).
  A main product that joins brings its own alternatives along, so there are **no chains**. With
  `newMainName`, a new product (the chosen product's unit, category and shop) becomes main of both groups.
  Refused: the same product, products already sharing stock, another household's product.
- **Unlink** (`DELETE …/alternative`): an alternative leaves its group; the stock stays with the main product.
- **Delete a main product**: its oldest alternative becomes the main product and takes the stock.
- **Every stock path resolves to the owner** (`stockOwnerId`): `listStock({ productId })`,
  `getProductStock` (`productId` in the answer is the owner), `createStockItem`, `findRestockTarget`, and
  restocking a bought item (any product of the group may restock the shared stock). `scanCode` returns the
  owner as `productId` and the scanned brand as `scannedProductId`.
- **Low stock**: stock at or below its minimum is reconciled when shopping is loaded and whenever stock is
  created or edited, including minimum-only edits and additions that leave stock low. The "Running low"
  item is for the main product; it isn't added when an open item for any
  product of the group is on a list (`ensureLowStockItem` → `groupProductIds`).
- **Shopping labels**: "Below minimum", "At minimum" and "Above minimum" use current stock, including
  shared stock for alternatives. A shopping item's place wins when stock is kept there; otherwise the
  lowest stock level across the product's places wins (below takes precedence over at minimum).
- **Essential products**: the catalogue product has an `isEssential` flag, editable in the product form
  and through `inventory.save_product`. Product-linked shopping items show "Essential" or "Nice to have";
  free-text items have no essential label. Stock at
  minimum is an amber warning, and stock below minimum is marked "To buy" in red. Both remain visible;
  the person decides what to buy. This setting identifies products; all stock at or below minimum
  still qualifies for automatic replenishment. Existing products start as non-essential.
- **Assistant and MCP**: `shopping_list`, `inventory_stock` and `inventory_low_stock` expose current
  `stockStatus`, `buyingAdvice` (`to_buy` or `warning`), `essential` and `importance` (`essential` or
  `nice_to_have`). `inventory_products` also reports importance, and `inventory_save_product` edits
  `isEssential` without resetting it when omitted. `shopping_list` can filter by `stockStatus` and
  `isEssential` for a question; those read filters never change which products are kept on the list.
  `shopping_add_item` accepts `product` to link a catalogue product and retain its stock and importance labels.
- **UI**: the product page has an *Alternatives* card (linked products with unlink, "Link an alternative"
  with the product picker); an alternative's page redirects to its main product's page with that brand
  highlighted (`?from=`). The products page's edit dialog shows the same section and grouped products get
  a "Shared stock" badge. The scan screen shows the scanned brand ("Shares stock with Bacon") but acts on
  the shared stock; after adding an unknown barcode it offers "This is an alternative for…". A shopping
  item of a group shows "or: Boni bacon, Delhaize bacon" with their shop links (`ShoppingItem.alternatives`).
- **Assistant**: `inventory.link_alternative` (first-time confirm, preview of the shared stock afterwards);
  `inventory.low_stock`'s `onShoppingList` counts items of any product of the group.
- **Cooking** (recipes, [RECIPES.md](RECIPES.md)): each "Used" tap is a `cooked` movement linked to the meal
  (`StockMovement.mealPlanEntryId`) via `useStockForCooking`; undoing it adds a correcting `cooked` movement
  (`revertCookedMovement`). `stockTotal(householdId, productId)` gives a product's total shared stock.
- **For other features** (e.g. recipes): `stockOwnerId(householdId, productId)` and
  `groupProductIds(householdId, ownerId)` in `src/api/shopping/shopping.service.ts`; or simply
  `listStock(householdId, { productId })`, which already resolves the owner.

## Barcode auto-fill

When a barcode is not in the household's catalogue, the app finds out what it is and pre-fills the new
product. For the user it is simply "scan a barcode → it fills in what it is, if known": the UI never
names where the data comes from.

### Flow

1. **Scan screen** — known own product: as before. Unknown EAN/UPC: the scanner stays busy ("Finding out
   what this is…") while `GET /api/shopping/barcode/:code` runs.
   - **Found**: a large card (photo, name, brand · size, category) and the product form opens pre-filled
     (name = brand + name + size, category, photo; the barcode as scanned). The user checks, edits and
     saves; then the card offers "Keep at a place" and "This is an alternative for…" (see *Alternatives*).
   - **Not found / failed / offline**: the normal empty form with the barcode filled in and a neutral
     "Not found" message. Children see the card but are asked to let an adult add it.
2. **Product form** (Products page, product pages, scan screen) — typing a valid barcode (debounced 0.5 s,
   check digit OK, not an in-store code) runs the same lookup and offers the result with a "Fill in"
   button. A product's own barcode and a code already filled in are not looked up again.

Once saved, the household's own `Product` is what the app uses; edits stay local and are never written
back to the cache.

### Codes

`normalizeBarcode` (`src/features/shopping/types/barcode-lookup.ts`): EAN-13, EAN-8, UPC-A (→ EAN-13
with a leading 0), UPC-E (expanded to UPC-A, then EAN-13; an 8-digit code that is a valid EAN-8 stays
EAN-8) and GTIN-14 with a leading 0, all with a GTIN check-digit check. In-store codes (EAN-13 prefixes
020–029 and 200–299, EAN-8 starting with 0 or 2: weighed produce, shop labels) are never looked up. The
product keeps the code exactly as scanned, so the next scan matches it; only lookups and the cache use the
normalised code.

### Sources and mapping

Server-side only (`src/api/shopping/barcode-lookup.ts`), with the v3 product API
(`/api/v3/product/<code>?fields=…`) and a `WickedHome/1.0 (+https://home.example.be)` User-Agent:

| Kind | Host |
|---|---|
| Food | world.openfoodfacts.org |
| Cosmetics, toiletries | world.openbeautyfacts.org |
| Pet food | world.openpetfoodfacts.org |
| Other products (cleaning, household…) | world.openproductsfacts.org |

The sites share one product index: the food site answers 404 "product found with a different product
type" for a shampoo or dish soap, so a lookup asks the food site first and then only the site of that
type. An unknown code costs one read, a non-food product two.

The answer is mapped to a neutral record (names per language, brand, quantity text, category tags, photo
URL) that is cached; per request it becomes a `ProductSuggestion`:

- **Name**: the user's language, then nl, fr, en, then the product's main name (generic name as a last
  resort). The form's name adds the brand (when not already in the name) and the size.
- **Brand**: the first brand, without legal form ("COCA-COLA SERVICES SA/NV" → "Coca-Cola Services").
- **Size**: parsed into the app's units (g, kg, ml, cl, l, pcs; dl → cl, mg → g), Belgian formats
  included: "1,5 l", "500 g", "6 x 33 cl", "33cl x 6", "16 oz (454 g)" → "454 g".
- **Category**: food category tags map onto the app's categories in a fixed order (frozen, baby,
  pharmacy, dairy, meat & fish, bakery, produce, coffee/tea → pantry, drinks, pantry); cosmetics →
  personal care, pet food → pets, cleaning products → household; otherwise none ("Other" in the form).

### Caching

Table `barcode_lookups` (`BarcodeLookup`, keyed by normalised code, shared by all households; public
data only): `found`, mapped `data` (JSON), `imageType`, `fetchedAt`.

- Hits are reused for **90 days**, misses retried after **7 days** (`isFreshLookup`).
- A failed or rate-limited lookup is not cached; an older cached hit is served instead when there is one.
- Two scans of the same code at once share one lookup.
- **Cleanup**: the `shopping.barcode-cache` job (daily 04:35, `src/api/shopping/shopping.jobs.ts`) deletes
  hits fetched more than **180 days** ago and misses older than **30 days**, with their photos
  (`product-images/<code>.*` only, resolved inside that directory). A row whose photo a saved product or
  shopping item still shows (`imageUrl` = `/api/shopping/barcode/<code>/image`) is kept, however old. The
  policy is pure (`src/api/shopping/barcode-cache.ts`); the work is `cleanUpBarcodeCache` in the service.

### Photos

Downloaded once with the lookup, from the sources' fixed image hosts only (`images.*` / `static.*` of the
four sites, https, no redirects), max 512 KB, 4 s timeout, accepted only when the magic bytes say JPEG,
PNG, WebP or GIF. Stored as `STORAGE_DIR/product-images/<code>.<ext>` (written to a temp file, then
renamed) and served by the app at `/api/shopping/barcode/<code>/image` (logged-in users, `nosniff`,
same-origin, browser cache 7 days). The browser never contacts the sources. A saved product stores that
path as its `imageUrl` (the product schema accepts it besides web links), so a photo in use is never
deleted (see *Cleanup* above).

### Limits

The sources allow about 15 product reads per minute per IP. WickedHome stays well under that:

- at most **10 source reads per minute** for the whole server;
- at most **6 lookups that reach the sources per minute per household** (cached answers are free);
- 4 s timeout and 300 KB cap per read; only the four API hosts and their image hosts can be reached
  (`fetchJsonFromFixedHost` / `fetchBytesFromFixedHost` in `src/api/lib/fixed-host-fetch.ts`).

Over a limit the answer is `unavailable`, which the UI shows like "not found".

### API

- `GET /api/shopping/barcode/:code` → `{ code, status: "found" | "not_found" | "unavailable", suggestion }`
  (400 for a code that isn't a valid EAN/UPC). Open to every role: it only reads.
- `GET /api/shopping/barcode/:code/image` → the stored photo, or 404.

### Tests

`src/api/shopping/barcode-lookup.test.ts`: normalisation and check digits, quantity parsing, name
language preference, brands, category mapping, cache freshness and mapping from hand-made sample answers
(no network). `src/api/shopping/barcode-cache.test.ts`: the cleanup policy (keep periods, kept photos in
use, photo paths that never leave `product-images/`).

### Known gaps

- If the food site is unreachable, the other sites aren't tried (they run on the same infrastructure).
- Unit counts: stock counts packages, so the form leaves "Unit" empty and puts the size in the name.
## Data sources and licences

Barcode auto-fill uses data from **Open Food Facts**, **Open Beauty Facts**, **Open Pet Food Facts** and
**Open Products Facts** (https://world.openfoodfacts.org and sister sites), made available by the Open
Food Facts association and its contributors.

- Product data: **Open Database License (ODbL) v1.0** — https://opendatacommons.org/licenses/odbl/1-0/
  (individual contents under the Database Contents License).
- Product photos: **Creative Commons Attribution-ShareAlike (CC BY-SA)** —
  https://creativecommons.org/licenses/by-sa/3.0/

By decision of the household, the source is credited here and not in the app's UI. Cached data and
photos stay within this installation; if they are ever shared or published, ODbL share-alike and CC BY-SA
attribution apply.

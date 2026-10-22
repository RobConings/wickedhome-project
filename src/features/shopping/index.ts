// Public API of the shopping feature. Routes, the app frame and other features import from here only.
//
// For Tasks: render `<TaskMaterialsPanel taskId canManage />` on a task; it loads and changes its own items.
// Server-side, `getMaterialStatusForTasks(householdId, taskIds)` and `deleteItemsForTask(householdId, taskId)`
// in src/api/shopping/shopping.service.ts.
// For Places: `<PlaceShoppingSection placeId />` (content only; wrap it in the place page's card).
// For Calendar: `renderShopList={(shopId) => <ShopShoppingList shopId={shopId} />}` on store visits.
// For Inventory: `ProductPicker`, `ProductFormDialog` + `handleProductForm` (scan → unknown barcode);
// barcode auto-fill: `isLookupBarcode(code)`, `lookupBarcode(code)` → `BarcodeLookupResult`, shown with
// `ProductSuggestionCard` and passed to `ProductFormDialog suggestion`.
// For the Dashboard: `fetchShoppingSummary()` → `ShoppingSummary` (items left to buy).
export { ProductCategoryIcon } from "./components/product-category-icon";
export { ProductThumb } from "./components/product-thumb";
export { ProductFormDialog } from "./components/product-form-dialog";
export { ProductPicker } from "./components/product-picker";
export { ProductSuggestionCard } from "./components/product-suggestion-card";
export { PlaceShoppingSection } from "./components/place-shopping-section";
export { ShopShoppingList } from "./components/shop-shopping-list";
export { ShoppingSourceBadge } from "./components/shopping-source-badge";
export { TaskMaterialsPanel } from "./components/task-materials-panel";
// For Projects: `<ProjectMaterialsPanel projectId canManage placeId onChange />` (its items and its tasks' materials,
// with a price per unit for the budget); items carry `project` for a chip.
export { ProjectMaterialsPanel } from "./components/project-materials-panel";
// Alternatives (shared stock): `<ProductAlternatives product products canManage />` and `LinkAlternativeDialog`
// post `link-alternative` / `unlink-alternative`; handle them with `handleProductAlternativeForm`.
export { LinkAlternativeDialog } from "./components/link-alternative-dialog";
export { ProductAlternatives } from "./components/product-alternatives";
export {
  handleProductAlternativeForm,
  handleProductForm,
  productsAction,
  productsLoader,
  shoppingAction,
  shoppingLoader,
  shoppingShouldRevalidate,
  type ProductsPageData,
  type ShoppingActionResult,
  type ShoppingPageData,
} from "./data/shopping-loaders";
export {
  createProduct,
  createShoppingItem,
  fetchProduct,
  fetchProducts,
  fetchShoppingItems,
  fetchShoppingSummary,
  lookupBarcode,
} from "./data/shopping-requests";
export {
  isLookupBarcode,
  type BarcodeLookupResult,
  type ProductSuggestion,
} from "./types/barcode-lookup";
export { useProductSelections } from "./data/use-product-selections";
export { ProductsScreen } from "./screens/products-screen";
export { ShopViewScreen } from "./screens/shop-view-screen";
export { ShoppingScreen } from "./screens/shopping-screen";
export {
  PRODUCT_CATEGORIES,
  canAddShoppingItems,
  canManageShopping,
  formatQuantity,
  type MaterialStatus,
  type Product,
  type ProductCategory,
  type ShoppingItem,
  type ShoppingItemSource,
  type ShoppingSummary,
} from "./types/shopping";
